-- 1층 admin_layer1_quality 의 subs_started · subs_expired 정의를 2층과 통일한다.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 10 (코디네이터 결정)
--
-- 🔴 **왜 20260921021000 을 고치지 않고 새 파일인가** — 그 파일은 이미 dev 에 적용됐다
--    (2026-09-27 supabase_migrations.schema_migrations 확인: version 20260921021000 기록됨.
--    병렬 세션이 dev 를 push 하면서 같이 올라갔다). 적용된 마이그는 재실행되지 않으므로
--    거기 덧붙이면 **dev 에는 영원히 안 들어가고 prod 에만 들어간다** = dev/prod 스키마 드리프트.
--    prod 는 아직 admin_layer* 가 0개라, 이 파일까지 함께 머지되면 prod 는 처음부터 고친 정의로
--    태어난다(= 틀린 숫자가 prod 화면에 나간 적이 한 번도 없다).
--
-- 🔴 **subs_started · subs_expired 두 줄만 바뀐다**(+ 유저 단위로 접기 위한 sub_user CTE).
--    나머지 본문은 20260921020000(Task 9) 판과 **글자 단위로 같다** — rate CTE 치환 근거와
--    20260921012000 의 free-first 귀속 · is_first NULL 3값 주석이 전부 그대로 유효하다.
--
-- 결함 2건 (dev 실측으로 재현):
--   ① 만료에 상한이 없었다 — 라우트가 항상 p_until: null 을 넘기므로 `expires_at >= p_since`
--      가 **미래 만료까지** "이번 창에 만료"로 센다. dev 에서 2026-10-14 만료 구독이 7일 창에서
--      expired=1 로 잡혔다(같은 시점 active=1 — 즉 "활성이면서 만료"). app/admin/page.tsx 의
--      subsNet = started − expired 가 그만큼 **과소**로 나온다. → `< now()` 상한.
--   ② 연장 재구매가 사람을 2로 센다 — purchase_byeolmaru_subscription(20260904100000)은 연장 시
--      **새 행**을 INSERT 하고 옛 행의 expires_at 을 그대로 둔다. 행 단위로 세면 구독이 끊긴 적
--      없는 사람이 만료로 잡히고 신규도 중복된다. → 유저별 MAX(expires_at) 하나로 접는다.
--      재구독하면 MAX 가 미래로 밀려 자동으로 만료에서 빠진다.
--
-- 🔴 이 정의는 admin_layer2_subscription(20260921021000)의 subscribers · expired 와
--    **정확히 같다.** 두 층이 같은 '만료'를 말해야 한다는 게 이 플랜의 요점이라, 화면 note 로
--    차이를 설명하는 건 차선이었다.
--    ⚠️ subs_started 의 단위가 **건수 → 사람 수**로 바뀐다(순증이 명−명 뺄셈이 된다).
--       lib/admin-metrics.ts 의 subscriber_net definition·caveat 을 같은 커밋에서 고쳤다.
--
-- 검증(2026-09-27 dev 인라인 전후 대조 — service_role 전용 함수 2개는 본문 인라인):
--   new+repeat == admin_layer1_pnl 매출 불변 · subscription_won / subscription_stars 불변 ·
--   subs_expired 1 → 0 (미래 만료가 빠졌다).
CREATE OR REPLACE FUNCTION admin_layer1_quality(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (
  new_payment_won BIGINT,
  repeat_payment_won BIGINT,
  subscription_won BIGINT,
  subscription_stars BIGINT,
  subs_started BIGINT,
  subs_expired BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH win_pay AS (
    SELECT p.id, p.user_id, p.amount_won,
           -- 그 사람의 첫 완료 결제인가. 창 밖의 과거 결제도 봐야 하므로 전 기간 MIN 과 비교한다.
           -- user_id IS NOT NULL 가드: 익명 보존 결제(탈퇴)는 식별 불가 → FALSE(=repeat) 로 취급.
           (p.user_id IS NOT NULL AND p.created_at = (
              SELECT MIN(q.created_at) FROM payments q
              WHERE q.user_id = p.user_id AND q.status = 'completed'
            )) AS is_first
    FROM payments p
    WHERE p.status = 'completed'
      AND p.created_at >= p_since
      AND (p_until IS NULL OR p.created_at < p_until)
      AND (p.user_id IS NULL OR p.user_id <> ALL(p_exclude))
  ), rate AS (
    -- 별 1개의 실효 원화 단가(전 기간 평균 — 소급 변조 방지). 이 파일 위쪽 함수가 정본이다:
    -- 2층 기여마진이 같은 함수를 쓰므로 두 층의 단가가 구조적으로 갈릴 수 없다.
    SELECT admin_star_won_rate(p_exclude) AS won_per_star
  ), sub_spend AS (
    -- 구독 소모 tx. purchase_byeolmaru_subscription(20260904100000)이 이 source 로 남긴다.
    SELECT t.id, t.user_id, t.amount
    FROM star_transactions t
    WHERE t.type = 'spend' AND t.source = 'byeolmaru_subscription'
      AND t.created_at >= p_since
      AND (p_until IS NULL OR t.created_at < p_until)
      AND t.user_id <> ALL(p_exclude)
  ), sub_free AS (
    SELECT f.tx_id, f.free_stars
    FROM admin_star_free_attribution(ARRAY(SELECT DISTINCT ss.user_id FROM sub_spend ss)) f
  ), sub_paid AS (
    SELECT ss.id, ss.amount,
           GREATEST(0, ss.amount - COALESCE(sf.free_stars, 0)) AS paid_stars
    FROM sub_spend ss
    LEFT JOIN sub_free sf ON sf.tx_id = ss.id
  ), sub AS (
    SELECT s.user_id, s.started_at, s.expires_at
    FROM byeolmaru_subscriptions s
    WHERE s.user_id <> ALL(p_exclude)
  ), sub_user AS (
    -- 유저의 구독 타임라인 끝. 연장으로 덮인 옛 행은 여기서 사라진다(2층과 같은 정의).
    SELECT s.user_id, MAX(s.expires_at) AS last_expiry
    FROM sub s GROUP BY s.user_id
  )
  SELECT
    (SELECT COALESCE(SUM(amount_won), 0) FROM win_pay WHERE is_first)::BIGINT,
    (SELECT COALESCE(SUM(amount_won), 0) FROM win_pay WHERE NOT is_first)::BIGINT,
    (SELECT ROUND(COALESCE(SUM(paid_stars), 0) * (SELECT won_per_star FROM rate)) FROM sub_paid)::BIGINT,
    (SELECT COALESCE(SUM(amount), 0) FROM sub_paid)::BIGINT,
    (SELECT COUNT(DISTINCT s.user_id) FROM sub s
     WHERE s.started_at >= p_since AND (p_until IS NULL OR s.started_at < p_until))::BIGINT,
    (SELECT COUNT(*) FROM sub_user su
     WHERE su.last_expiry >= p_since
       AND su.last_expiry < now()
       AND (p_until IS NULL OR su.last_expiry < p_until))::BIGINT;
$$;

REVOKE ALL ON FUNCTION admin_layer1_quality(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer1_quality(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
