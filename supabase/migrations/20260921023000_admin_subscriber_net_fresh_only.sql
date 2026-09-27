-- 구독 '순증'이 이름값을 하게 한다 — 연장 재구매를 신규에서 뺀다.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 10 (리뷰 반영)
--
-- 🔴 결함 (코드 읽기 + dev 확인): purchase_byeolmaru_subscription(20260904100000:56)의 INSERT 는
--    `started_at` 을 **생략**해 DEFAULT now() 로 넣는다. 그래서 창 안에 **연장만 한** 유저도
--    started_at 이 창 안이라 subs_started 에 +1 이고, MAX(expires_at) 은 미래라 만료엔 안 잡힌다
--    → **신규 구독자 0명인데 순증 +1.** 1층 카드는 이걸 "구독자 순증"이라는 이름으로 띄운다.
--    2층 note 가 "구매(건) vs 구독자(명) 차이 = 연장"이라고 설명하지만, 1층엔 그 설명이 없다.
--    → 문구가 아니라 **지표를 고친다.**
--
-- 새 정의: **창 안에 구독을 시작한 사람 중 그 시점에 활성 구독이 없던 사람.**
--    같은 유저의 다른 행 중 `started_at < 이 행 AND expires_at > 이 행` 인 게 없으면 신규다.
--    연장은 빠지고, **끊겼다 돌아온 사람은 잡힌다** — 그게 '순증'의 뜻이다.
--    1층 subs_started 와 2층 subscribers 에 **같은 CTE** 를 쓴다(두 층이 갈리면 안 된다).
--    `started`(구매 건수)는 그대로 전체 건수다 — 신규(명) 대비가 **연장 규모**를 보여준다.
--
-- 🔴 왜 또 새 파일인가 — 20260921021000 은 이미 dev 에 적용됐다(2026-09-27 schema_migrations
--    확인). 적용된 마이그는 재실행되지 않으므로 편집하면 **dev 는 영영 미실행 / prod 만 전문
--    실행** = 조용한 드리프트. 20260921022000 은 아직 미적용이지만 이미 커밋돼 병렬 세션이
--    언제든 push 할 수 있어 같은 규칙을 적용한다. 이 규칙은 이 플랜 전체에 적용된다.
--
-- 🔴 정정 — 20260921021000 헤더가 admin_layer2_revenue_mix 의 WHERE 절이 admin_layer1_pnl 의
--    rev CTE 와 "글자 단위로 같다"고 적었는데 **엄밀히는 사실이 아니다**: revenue_mix 에는
--    `p_until` 절이 하나 더 있다. 불변식이 성립하는 진짜 이유는 **라우트가 항상
--    `p_until: null` 을 넘겨서** 그 절이 무력화되기 때문이다 — 즉 **조건부**다. p_until 을
--    쓰는 호출부가 생기면 admin_layer1_pnl(p_until 인자 자체가 없다)과 창이 갈린다.
--
-- ⚠️ admin_layer2_subscription 은 반환 컬럼이 9 → 10 개(purchasers 추가)라 CREATE OR REPLACE
--    로는 못 바꾼다(42P13 "cannot change return type"). DROP 후 재생성하며, DROP 이 ACL 을
--    지우므로 REVOKE/GRANT 를 아래에서 다시 건다.
--    purchasers = 창 안에 구독을 **산 사람 전원**(연장 포함) = 방문 지표의 모수. 연장한 사람이야말로
--    붙어 있는 구독자라 방문 평균에서 빼면 안 된다 — 그래서 subscribers(신규)와 분리한다.
--
-- 검증(2026-09-27 dev 인라인 전후 대조): 1·2층 subs_started/subscribers 불변(연장 0건이라
-- 안 바뀌는 게 정상 — 그걸 확인하는 게 요점) · new+repeat == admin_layer1_pnl 매출 불변 ·
-- subscription_won / subscription_stars 불변.

DROP FUNCTION IF EXISTS admin_layer2_subscription(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]);

CREATE OR REPLACE FUNCTION admin_layer2_subscription(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (
  started BIGINT,
  subscribers BIGINT,
  purchasers BIGINT,
  expired BIGINT,
  active_now BIGINT,
  stars_spent BIGINT,
  free_stars BIGINT,
  avg_visit_days NUMERIC,
  visit_days BIGINT,
  sub_days BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sub AS (
    SELECT s.user_id, s.started_at, s.expires_at
    FROM byeolmaru_subscriptions s
    WHERE s.user_id <> ALL(p_exclude)
  ), sub_user AS (
    -- 유저의 구독 타임라인 끝. 연장으로 덮인 옛 행은 여기서 사라진다.
    SELECT s.user_id, MAX(s.expires_at) AS last_expiry
    FROM sub s GROUP BY s.user_id
  ), win AS (
    SELECT * FROM sub
    WHERE started_at >= p_since AND (p_until IS NULL OR started_at < p_until)
  ), win_user AS (
    SELECT w.user_id,
           MIN(w.started_at) AS s_at,
           MAX(LEAST(w.expires_at, now())) AS e_at
    FROM win w GROUP BY w.user_id
  ), win_fresh AS (
    -- 🔴 **진짜 신규**만 — 그 시점에 활성 구독이 없던 사람. 연장 재구매는
    --    purchase_byeolmaru_subscription 이 started_at 을 생략해 DEFAULT now() 로 넣으므로
    --    창 안에 started_at 이 찍히고, MAX(expires_at) 은 미래라 만료에도 안 잡힌다
    --    → 신규 0명인데 순증 +1 이 된다(20260904100000:56). 그 행을 여기서 뺀다.
    --    끊겼다 돌아온 사람은 겹치는 행이 없어 잡힌다 — 그게 '순증'의 뜻이다.
    SELECT DISTINCT w.user_id
    FROM win w
    WHERE NOT EXISTS (
      SELECT 1 FROM sub o
      WHERE o.user_id = w.user_id
        AND o.started_at < w.started_at
        AND o.expires_at > w.started_at
    )
  ), vis AS (
    SELECT (SELECT COUNT(DISTINCT (pv.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date)
            FROM page_views pv
            WHERE pv.user_id = wu.user_id
              AND pv.is_bot = false
              AND pv.created_at >= wu.s_at
              AND pv.created_at < wu.e_at) AS days,
           -- 구독이 살아 있던 달력일(KST). 시작일·종료일 모두 부분적으로라도 살아 있으므로 포함.
           GREATEST(((wu.e_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date
                     - (wu.s_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date) + 1, 1)::BIGINT AS span
    FROM win_user wu
  ), sub_spend AS (
    -- 구독 소모 tx. purchase_byeolmaru_subscription(20260904100000)이 이 source 로 남긴다.
    -- ⚠️ star_transactions.user_id 는 NOT NULL 이라 NULL 가드가 필요 없다(payments 와 다르다).
    SELECT t.id, t.user_id, t.amount
    FROM star_transactions t
    WHERE t.type = 'spend' AND t.source = 'byeolmaru_subscription'
      AND t.created_at >= p_since
      AND (p_until IS NULL OR t.created_at < p_until)
      AND t.user_id <> ALL(p_exclude)
  ), sub_free AS (
    -- 헬퍼는 유저별 **전체 원장**을 시간순으로 걸어야 무료 풀 잔량이 맞다 → 대상 유저를 전부
    -- 넘기고 tx_id 로 다시 조인해 **창 안의 소모 행에만** 무료 몫을 붙인다.
    SELECT f.tx_id, f.free_stars
    FROM admin_star_free_attribution(ARRAY(SELECT DISTINCT ss.user_id FROM sub_spend ss)) f
  )
  SELECT
    (SELECT COUNT(*) FROM win)::BIGINT,
    (SELECT COUNT(*) FROM win_fresh)::BIGINT,
    (SELECT COUNT(*) FROM win_user)::BIGINT,
    (SELECT COUNT(*) FROM sub_user
      WHERE last_expiry >= p_since
        AND last_expiry < now()
        AND (p_until IS NULL OR last_expiry < p_until))::BIGINT,
    (SELECT COUNT(*) FROM sub_user WHERE last_expiry > now())::BIGINT,
    (SELECT COALESCE(SUM(ss.amount), 0) FROM sub_spend ss)::BIGINT,
    (SELECT COALESCE(SUM(COALESCE(sf.free_stars, 0)), 0)
       FROM sub_spend ss LEFT JOIN sub_free sf ON sf.tx_id = ss.id)::BIGINT,
    (SELECT ROUND(AVG(v.days), 1) FROM vis v),
    (SELECT COALESCE(SUM(v.days), 0) FROM vis v)::BIGINT,
    (SELECT COALESCE(SUM(v.span), 0) FROM vis v)::BIGINT;
$$;

REVOKE ALL ON FUNCTION admin_layer2_subscription(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_subscription(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;

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
  ), win_fresh AS (
    -- 🔴 **진짜 신규**만 — 그 시점에 활성 구독이 없던 사람. 연장 재구매는
    --    purchase_byeolmaru_subscription 이 started_at 을 생략해 DEFAULT now() 로 넣으므로
    --    창 안에 started_at 이 찍히고, MAX(expires_at) 은 미래라 만료에도 안 잡힌다
    --    → 신규 0명인데 순증 +1 이 된다(20260904100000:56). 그 행을 여기서 뺀다.
    --    끊겼다 돌아온 사람은 겹치는 행이 없어 잡힌다 — 그게 '순증'의 뜻이다.
    SELECT DISTINCT w.user_id
    FROM sub w
    WHERE w.started_at >= p_since
      AND (p_until IS NULL OR w.started_at < p_until)
      AND NOT EXISTS (
        SELECT 1 FROM sub o
        WHERE o.user_id = w.user_id
          AND o.started_at < w.started_at
          AND o.expires_at > w.started_at
      )
  )
  SELECT
    (SELECT COALESCE(SUM(amount_won), 0) FROM win_pay WHERE is_first)::BIGINT,
    (SELECT COALESCE(SUM(amount_won), 0) FROM win_pay WHERE NOT is_first)::BIGINT,
    (SELECT ROUND(COALESCE(SUM(paid_stars), 0) * (SELECT won_per_star FROM rate)) FROM sub_paid)::BIGINT,
    (SELECT COALESCE(SUM(amount), 0) FROM sub_paid)::BIGINT,
    (SELECT COUNT(*) FROM win_fresh)::BIGINT,
    (SELECT COUNT(*) FROM sub_user su
     WHERE su.last_expiry >= p_since
       AND su.last_expiry < now()
       AND (p_until IS NULL OR su.last_expiry < p_until))::BIGINT;
$$;

REVOKE ALL ON FUNCTION admin_layer1_quality(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer1_quality(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
