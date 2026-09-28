-- 2층 "기여 ▾" — 상품별 기여마진의 세 입력 + 실효 단가 정의의 단일화.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 9
-- 🔴 플랜 원문 SQL 을 그대로 쓰지 않는다 — 2026-09-27 dev/prod 실측으로 결함 2건이 확정됐다.
--    ① 매출 귀속을 domain 이 아니라 **source** 로 한다(admin_layer2_spend_by_source 주석).
--    ② admin_star_won_rate 에 p_exclude 가 없었다(아래 주석).

-- ── 별 1개의 실효 원화 단가 ────────────────────────────────────────────────
-- 패키지 믹스를 그대로 반영한다(고정 상수는 가격 개편 때 과거를 변조한다).
--
-- 🔴 p_exclude 를 받는 이유 — 플랜 원안은 **인자가 없었다.** 그런데 Task 7 이 이미
--    admin_layer1_quality 의 인라인 rate CTE 에서 같은 결함을 고쳤다: 어드민·테스트 결제
--    6건(49,600원/670별)이 단가를 끌어내리고 있었다(89.23 → 90.64, +1.6%).
--    인자 없는 함수를 그대로 쓰면 **1층 구독 매출은 90.64원/별, 2층 기여마진은 89.23원/별** 이
--    되어 같은 "실효 단가" 가 두 값이 된다 — 이 플랜이 없애려는 바로 그 정의 드리프트다.
--    → 함수로 못박고 admin_layer1_quality 가 이 함수를 부르게 바꾼다(파일 끝).
--
-- 🔴 `(user_id IS NULL OR user_id <> ALL(p_exclude))` — payments.user_id 는 탈퇴 시 NULL 로
--    익명 보존된다(withdrawal-payments-anonymize). `<> ALL` 만 쓰면 NULL 3값 논리로 그 결제가
--    단가에서 통째로 빠진다. prod 실측: 익명 결제 6건, 빼면 90.6354 → 90.6338 로 어긋난다.
CREATE OR REPLACE FUNCTION admin_star_won_rate(p_exclude UUID[])
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount_won)::NUMERIC / NULLIF(SUM(stars_given), 0), 0)
  FROM payments
  WHERE status = 'completed'
    AND (user_id IS NULL OR user_id <> ALL(p_exclude));
$$;

REVOKE ALL ON FUNCTION admin_star_won_rate(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_star_won_rate(UUID[]) TO service_role;

-- ── 매출 귀속의 원재료: source 별 별 소모 ──────────────────────────────────
-- 🔴 왜 admin_star_spend_breakdown 을 안 쓰나 — 그 RPC 의 domain 은 분류 사다리 끝에
--    `ELSE 'upsell'` 폴백이 있다. 거기 떨어지는 게 인챗 업셀이 아니다(2026-09-27 dev 실측):
--      relationship_slot 1,800별(전체 4위) · relationship_sim 75 · relationship_sim_suggest 10
--      · byeolmaru_subscription 20.
--    domain→타로 로 접으면 **별마루는 매출 0 + 원가 전액 = 영구 적자**로 보이고 타로는 남의
--    매출을 얹는다. prod 는 아직 5별뿐이라 미미하지만 별마루가 나가는 순간 구독 매출이 통째로
--    타로로 간다. → 라벨링은 앱(lib/admin/product-map.ts)이 source 로 한다. 유닛으로 잠긴다.
--
-- 🔴 기존 admin_star_spend_breakdown 은 **건드리지 않는다** — /admin/analytics 와 2층 '매출 ▾'
--    의 별 소모 5종이 그걸 쓴다. 고치면 그 화면들의 숫자가 바뀐다.
--
-- 비상품 제외(1단계)와 무료별 귀속은 그 RPC 와 **같은 규칙**을 쓴다 — 두 화면의 "별 소모" 가
-- 같은 모수여야 나란히 읽힌다. 무료 귀속은 정본 헬퍼 재사용(20260731050000).
-- ⚠️ 헬퍼는 유저별 **전체 원장**을 시간순으로 걸어야 무료 풀 잔량이 맞다 → 대상 유저를 전부
--    넘기고 tx_id 로 다시 조인해 **창 안의 소모 행에만** 무료 몫을 붙인다.
--    헬퍼는 `free_stars > 0` 인 행만 반환하므로 **LEFT JOIN + COALESCE 필수**.
-- ⚠️ star_transactions.user_id 는 NOT NULL 이라 NULL 가드가 필요 없다(payments 와 다르다).
CREATE OR REPLACE FUNCTION admin_layer2_spend_by_source(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (source TEXT, stars BIGINT, free_stars BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH win AS (
    SELECT t.id AS id, t.user_id AS user_id, t.amount AS amount, t.source AS source
    FROM star_transactions t
    WHERE t.type = 'spend'
      AND t.created_at >= p_since
      AND (p_until IS NULL OR t.created_at < p_until)
      AND t.user_id <> ALL(p_exclude)
      -- 비상품 제외 (충전·보너스·수동조정 + 운세 환불) — 분류 사다리 1단계와 동일.
      -- ⚠️ `_` 는 LIKE 와일드카드라 left(...) 로 못박는다(AGENTS.md).
      AND t.source NOT IN ('pg','welcome_bonus','first_charge_bonus','admin_adjust')
      AND left(t.source, 14) <> 'fortune_refund'
  ), freemap AS (
    SELECT f.tx_id AS tx_id, f.free_stars AS free_stars
    FROM admin_star_free_attribution(ARRAY(SELECT DISTINCT w.user_id FROM win w)) f
  )
  SELECT w.source,
         SUM(w.amount)::BIGINT,
         SUM(COALESCE(fm.free_stars, 0))::BIGINT
  FROM win w
  LEFT JOIN freemap fm ON fm.tx_id = w.id
  GROUP BY w.source
  ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION admin_layer2_spend_by_source(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_spend_by_source(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;

-- ── 원가 귀속의 원재료: route 별 API 원가 ──────────────────────────────────
-- 라벨 매핑은 앱(lib/admin/product-map.ts)이 한다 — SQL CASE 는 테스트가 안 된다.
-- ⚠️ route IS NULL 은 QA·probe 행이라 뺀다(admin_layer1_pnl 과 같은 규칙).
CREATE OR REPLACE FUNCTION admin_layer2_cost_by_route(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (route TEXT, cost_won NUMERIC, calls BIGINT, free_user_cost_won NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.route,
         COALESCE(SUM(l.cost_won), 0),
         COUNT(*)::BIGINT,
         -- 🔴 "그 호출 시점에 결제 이력이 있었나" — is_free_user 컬럼을 두지 않은 이유가 이것이다
         --    (플랜 A). 나중에 결제해도 과거 행의 기준이 바뀌지 않아야 한다.
         -- ⚠️ user_id IS NULL 도 미결제자로 센다 — 탈퇴(ON DELETE SET NULL)·배치 호출이라
         --    판별 자체가 불가능하다. 이 몫은 실제보다 소폭 높게 나온다(화면 note 가 말한다).
         COALESCE(SUM(l.cost_won) FILTER (
           WHERE l.user_id IS NULL OR NOT EXISTS (
             SELECT 1 FROM payments p
             WHERE p.user_id = l.user_id AND p.status = 'completed' AND p.created_at < l.created_at
           )
         ), 0)
  FROM llm_usage l
  WHERE l.created_at >= p_since
    AND (p_until IS NULL OR l.created_at < p_until)
    AND l.route IS NOT NULL
    AND (l.user_id IS NULL OR l.user_id <> ALL(p_exclude))
  GROUP BY l.route
  ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION admin_layer2_cost_by_route(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_cost_by_route(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;

-- ── 1층 admin_layer1_quality 의 rate CTE → admin_star_won_rate 호출로 치환 ──
-- 🔴 **rate CTE 하나만 바뀐다.** 나머지 본문은 20260921012000 원본 그대로다(그 파일의 긴
--    근거 주석 — free-first 귀속 · is_first 의 NULL 3값 논리 — 이 그대로 유효하다).
--    목적은 동작 변경이 아니라 **정의의 단일화**다: 1층 구독 매출과 2층 기여마진이 같은
--    실효 단가를 쓰게 한다. 치환 전후 값이 달라지면 그건 버그다(검증: 2026-09-27 prod/dev
--    인라인 대조 — 7d/30d new+repeat == admin_layer1_pnl 매출, subscription_won 불변).
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
