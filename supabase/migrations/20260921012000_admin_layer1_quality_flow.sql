-- admin_layer1_quality / admin_layer1_flow — 1층의 "매출의 질" 과 "흐름" 줄.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 7
-- 🔴 플랜 원문 SQL 은 그대로 쓰지 않는다 — 2026-09-27 prod/dev 실측으로 결함이 확정됐다(코디네이터
--    지시 + 이 파일이 추가로 확인한 것 1건, 아래 각 함수 주석 참조).

-- ── 매출의 질 ──────────────────────────────────────────────────────────────
-- 🔴 구독 매출은 원화 결제가 아니라 **별 소모**다(byeolmaru_subscriptions.stars_spent 가 아니라
--    star_transactions 의 source='byeolmaru_subscription' spend 행 — 아래 참조). 무료별(웰컴
--    보너스 등)로 산 구독의 매출 기여는 0 이므로 유료별만 환산한다.
--    환산 단가는 **실효 단가** = 완료 결제의 SUM(amount_won)/SUM(stars_given) — 패키지 믹스를
--    그대로 반영한다. 고정 상수를 쓰면 가격 개편 때마다 과거가 소급 변조된다.
--
-- 🔴 free-first 귀속 — 플랜 원안의 sub_paid 는 두 겹으로 틀렸었다(2026-09-27 실측):
--    ① 무료별을 `type='charge' AND payment_id IS NULL` 로 잡았는데 charge 행은 **전부**
--       payment_id 가 있다(prod 2,973건 중 NULL 0건) → 매칭 0건, 무료별이 항상 0 으로 나온다.
--       실제 무료 충전 판정 기준은 **`source <> 'pg'`** 다(admin_star_free_attribution 참조).
--    ② `spend.amount` 는 **양수**(5~60)인데 원안이 `SUM(-t.amount)` 로 빼서 부호가 뒤집혔다.
--    → 정본 헬퍼 `admin_star_free_attribution(p_users UUID[]) RETURNS (tx_id, free_stars)`
--      (20260731050000)를 재사용한다. `lib/admin-metrics.ts` 의 `subscription_won` 정의가
--      이미 "admin_star_spend_breakdown 과 같은 규칙(그 헬퍼)을 재사용한다"고 약속하는데
--      플랜 SQL 만 그 약속을 어겼었다 — 레지스트리가 정본이다.
--    ⚠️ 헬퍼는 유저별 **전체 원장**을 시간순으로 걸어야 무료 풀 잔량이 맞다(윈도우 CTE 로는
--       표현 불가 — 헬퍼 자체가 재귀 CTE인 이유). 그래서 대상 유저는 `p_users` 로 전부 넘기고,
--       tx_id 로 다시 조인해 **창 안의 소모 행에만** 무료 몫을 붙인다. 헬퍼는 `free_stars > 0`
--       인 행만 반환하므로 **LEFT JOIN + COALESCE 필수**.
--    ⚠️ prod 검증이 이 버그를 못 잡는다 — 별마루가 prod 에 없어 구독 tx 가 0건이라 무엇을 써도
--       0 이 나온다. dev(SUPABASE_PROJECT_REF=vtdmxdcetziileynjaxi)에서 실제 구독 데이터로 검증.
--
-- 🔴 이 파일이 추가로 확인한 결함(플랜에 없던 것) — is_first 의 NULL 3값 논리:
--    `payments.user_id` 는 탈퇴 시 NULL 로 익명 보존된다(withdrawal-payments-anonymize).
--    플랜 원안의 is_first 는 `p.created_at = (SELECT MIN(...) WHERE q.user_id = p.user_id ...)`
--    인데 p.user_id 가 NULL 이면 이 등식 전체가 NULL 이 된다 → `WHERE is_first` 도
--    `WHERE NOT is_first` 도 그 행을 **버린다**(3값 논리, AGENTS.md 의 반복 함정 클래스).
--    결과: 익명 보존된 결제가 new_payment_won 과 repeat_payment_won 양쪽에서 통째로 증발해
--    "new+repeat == admin_layer1_pnl 매출" 불변식이 깨진다.
--    🔴 2026-09-27 prod 30일 창 실측: 익명 보존 결제 5건 존재. 원안대로면 합계가 pnl 대비
--       **6,800원 부족**(256,600 vs 263,400). `p.user_id IS NOT NULL AND (...)` 로 감싸 NULL 을
--       FALSE 로 못박으면(=식별 불가능한 결제는 "재결제"로 보수적으로 분류) 정확히 일치한다
--       (검증 쿼리로 263,400 == 263,400 확인, 아래 함수가 그 형태).
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
    -- 별 1개의 실효 원화 단가(전 기간 평균 — 소급 변조 방지). 분모 0 방어.
    -- 🔴 win_pay·sub 와 같은 이유로 p_exclude 를 건다 — 어드민·테스트 결제가 섞이면 모든
    --    구독자의 환산 단가가 그만큼 왜곡된다. user_id IS NULL(탈퇴 익명보존)은 반드시
    --    통과시켜야 한다 — `<> ALL` 만 쓰면 NULL 3값 논리로 그 결제가 단가 계산에서
    --    통째로 빠진다(이 파일의 is_first 와 같은 함정 클래스, AGENTS.md).
    SELECT COALESCE(SUM(amount_won)::NUMERIC / NULLIF(SUM(stars_given), 0), 0) AS won_per_star
    FROM payments
    WHERE status = 'completed'
      AND (user_id IS NULL OR user_id <> ALL(p_exclude))
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
  )
  SELECT
    (SELECT COALESCE(SUM(amount_won), 0) FROM win_pay WHERE is_first)::BIGINT,
    (SELECT COALESCE(SUM(amount_won), 0) FROM win_pay WHERE NOT is_first)::BIGINT,
    (SELECT ROUND(COALESCE(SUM(paid_stars), 0) * (SELECT won_per_star FROM rate)) FROM sub_paid)::BIGINT,
    (SELECT COALESCE(SUM(amount), 0) FROM sub_paid)::BIGINT,
    (SELECT COUNT(*) FROM sub
     WHERE started_at >= p_since AND (p_until IS NULL OR started_at < p_until))::BIGINT,
    (SELECT COUNT(*) FROM sub
     WHERE expires_at >= p_since AND (p_until IS NULL OR expires_at < p_until))::BIGINT;
$$;

REVOKE ALL ON FUNCTION admin_layer1_quality(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer1_quality(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;

-- ── 흐름 ───────────────────────────────────────────────────────────────────
-- 🔴 D7 분모가 구조적으로 0 이었다(2026-09-27 확정) — 플랜 원안은 signups 와 같은 `p_since`
--    (=win7, 최근 7일) 로 코호트를 만들고, 그중 `created_at < now() - 7 days` 를 "성숙"으로
--    걸렀다. 7일 코호트 전원이 7일 미만 전 가입이니 교집합이 항상 빈다(실측: 7일 창 분모 0).
--    2일+ 방문도 같은 편향 — 어제 가입자는 구조적으로 2일 방문을 못 채운다(실측 7일 5.0% vs
--    30일 9.2%).
--    → **사용자 결정**: 활동량 3칸(signups·readings·uv)은 계속 `p_since`(7일). 리텐션 2칸
--      (d7_return·d7_eligible / visit2·cohort)만 별도 파라미터 `p_retention_since`(호출부는
--      30일 전)로 분리한다. 화면은 두 칸의 창이 다르다는 것을 sub 로 명시해야 한다(아래 화면
--      쪽 주석 참조) — 안 그러면 같은 줄 안에서 "왜 이 두 칸만 분모가 다르지"가 오독을 부른다.
-- ⚠️ visits/rvisits CTE 는 **페이지뷰에 창 필터를 걸지 않는다** — 리텐션은 "코호트 창 밖에라도
--    돌아왔나"를 묻는 것이라 방문 자체의 시각은 창에 갇히면 안 된다(코호트 소속만 창으로 거른다).
-- ⚠️ UV 는 **페이지뷰 귀속**(uv_pageview) 이다 — 세션 시작 귀속(uv_session)과 분모가 다르다.
--    두 정의의 공존은 의도된 것이고, 화면이 어느 쪽인지 반드시 라벨로 말해야 한다.
CREATE OR REPLACE FUNCTION admin_layer1_flow(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[],
  p_retention_since TIMESTAMPTZ
)
RETURNS TABLE (
  signups BIGINT,
  readings BIGINT,
  uv BIGINT,
  d7_return BIGINT,
  d7_eligible BIGINT,
  visit2 BIGINT,
  cohort BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH coh AS (
    -- 활동량 칸(signups) 전용 — 7일 창.
    SELECT u.id
    FROM users u
    WHERE u.created_at >= p_since
      AND (p_until IS NULL OR u.created_at < p_until)
      AND u.id <> ALL(p_exclude)
  ), rcoh AS (
    -- 리텐션 2칸 전용 — 30일 창(성숙 조건을 만족할 여지가 있는 코호트).
    SELECT u.id, u.created_at
    FROM users u
    WHERE u.created_at >= p_retention_since
      AND (p_until IS NULL OR u.created_at < p_until)
      AND u.id <> ALL(p_exclude)
  ), rvisits AS (
    SELECT pv.user_id,
           COUNT(DISTINCT (pv.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date) AS days,
           MAX(pv.created_at) AS last_at
    FROM page_views pv
    JOIN rcoh ON rcoh.id = pv.user_id
    WHERE NOT COALESCE(pv.is_bot, false)
    GROUP BY 1
  )
  SELECT
    (SELECT COUNT(*) FROM coh)::BIGINT,
    (SELECT COUNT(*) FROM readings r
      WHERE r.created_at >= p_since
        AND (p_until IS NULL OR r.created_at < p_until)
        AND r.user_id <> ALL(p_exclude))::BIGINT,
    (SELECT COUNT(DISTINCT pv.anon_id) FROM page_views pv
      WHERE pv.anon_id IS NOT NULL
        AND NOT COALESCE(pv.is_bot, false)
        AND pv.created_at >= p_since
        AND (p_until IS NULL OR pv.created_at < p_until)
        AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT COUNT(*) FROM rcoh c
      JOIN rvisits v ON v.user_id = c.id
      WHERE c.created_at < now() - INTERVAL '7 days'
        AND v.last_at >= c.created_at + INTERVAL '7 days')::BIGINT,
    (SELECT COUNT(*) FROM rcoh WHERE created_at < now() - INTERVAL '7 days')::BIGINT,
    (SELECT COUNT(*) FROM rvisits WHERE days >= 2)::BIGINT,
    (SELECT COUNT(*) FROM rcoh)::BIGINT;
$$;

REVOKE ALL ON FUNCTION admin_layer1_flow(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer1_flow(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TIMESTAMPTZ) TO service_role;
