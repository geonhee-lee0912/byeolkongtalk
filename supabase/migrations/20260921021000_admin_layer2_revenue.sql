-- 2층 "매출 ▾" 보강 + "구독 ▾" 신설 — 패키지 믹스와 구독의 성립 조건을 쪼갠다.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 10
--
-- 🔴 플랜 원문 SQL 을 그대로 쓰지 않는다 — 2026-09-27 prod/dev 실측으로 결함 5건이 확정됐다.
--    ① is_first 의 NULL 3값 논리(익명 결제 6건) ② 무료별을 payment_id IS NULL 로 판정(0행 매칭)
--    ③ spend.amount 부호 뒤집힘 ④ 방문일에 구독 창 필터 없음 ⑤ 만료가 미래 만료까지 셈.
--    각 근거는 해당 지점 주석에 실측치와 함께 적었다.

-- ── 패키지별 × 신규/재결제 ────────────────────────────────────────────────
-- 1층 "매출의 질" 줄이 신규/재결제 **합계만** 보여준다. 여기서 패키지로 한 번 더 쪼갠다.
--
-- 🔴 불변식 — 이 함수의 SUM(won) 은 같은 창의 admin_layer1_pnl 매출과 **정확히 같아야 한다.**
--    두 RPC 가 같은 payments 를 다르게 필터하면 한 화면 안에서 숫자가 어긋난다(Task 7 에서
--    이 대조가 6,800원 유실을 잡았다). 그래서 WHERE 절이 admin_layer1_pnl 의 rev CTE 와
--    **글자 단위로 같다.** 검증(2026-09-27 prod 인라인): 7d 48,600 / 30d 257,800 / 전기간
--    656,200 — 세 창 모두 diff 0.
--
-- 🔴 is_first 의 `p.user_id IS NOT NULL AND (...)` 가드 — payments.user_id 는 탈퇴 시 NULL 로
--    익명 보존된다(withdrawal-payments-anonymize). 가드가 없으면 등식이 NULL 이 되고, GROUP BY
--    라 행이 사라지는 대신 **is_first = NULL 인 제3의 그룹**이 생긴다. 앱의
--    `r.is_first ? "신규" : "재결제"` 는 그걸 조용히 "재결제"로 떨어뜨린다 — 즉 화면에는
--    이미 재결제로 나오는데 SQL 은 "모른다"고 말하는, 설명 없는 불일치가 된다.
--    → Task 7 의 admin_layer1_quality 와 **같은 방식**으로 NULL 을 FALSE(재결제)로 못박고
--      그 선택을 화면 note 가 말한다. prod 실측 해당 행: 전기간 6건 / 30d 5건 / 7d 2건.
--    보수적 분류인 이유: 익명 결제는 그 사람의 다른 결제를 찾을 수 없어 "첫 결제"를 주장할
--    근거가 없다. 신규로 세면 신규 매출이 실제보다 커진다.
--    교차 검증(prod 전기간): is_first=true 204건 == 결제자 204명(어드민 6 제외). 1인 1건으로
--    정확히 떨어진다 = 익명 6건이 전부 재결제 쪽에 있다는 뜻.
CREATE OR REPLACE FUNCTION admin_layer2_revenue_mix(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (package_type TEXT, is_first BOOLEAN, cnt BIGINT, won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.package_type::TEXT,
         (p.user_id IS NOT NULL AND p.created_at = (
            SELECT MIN(q.created_at) FROM payments q
            WHERE q.user_id = p.user_id AND q.status = 'completed'
          )) AS is_first,
         COUNT(*)::BIGINT,
         SUM(p.amount_won)::BIGINT
  FROM payments p
  WHERE p.status = 'completed'
    AND p.created_at >= p_since
    AND (p_until IS NULL OR p.created_at < p_until)
    AND (p.user_id IS NULL OR p.user_id <> ALL(p_exclude))
  GROUP BY 1, 2
  ORDER BY 4 DESC;
$$;

REVOKE ALL ON FUNCTION admin_layer2_revenue_mix(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_revenue_mix(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;

-- ── 구독 — 순증 · 별 소모 · 구독 기간 안의 방문 ────────────────────────────
-- 🔴 5일+ 방문이 0.7% 인 위에서 30일 구독이 성립하는지가 이 서비스의 핵심 질문이다(스펙 §2-5).
--    그래서 구독 수와 **구독 기간 안의 방문일**을 같은 블록에서 읽는다.
--
-- 🔴 무료별 몫은 정본 헬퍼 admin_star_free_attribution(20260731050000) 재사용이다.
--    플랜 원안은 `type='charge' AND payment_id IS NULL` 로 무료 충전을 골랐는데 prod 에서
--    **charge 2,973건 중 payment_id IS NULL 이 0건**이다(실제 무료 판정 기준은 source <> 'pg').
--    게다가 차감항의 `SUM(-t.amount)` 는 spend.amount 가 **양수**(5~60)라 부호가 뒤집힌다.
--    두 결함이 겹쳐 원안은 항상 0 을 뱉는다. → 헬퍼로 대체(Task 9 admin_layer2_spend_by_source
--    와 같은 패턴). 헬퍼는 **free_stars > 0 인 행만** 반환하므로 LEFT JOIN + COALESCE 필수.
--
-- 🔴 stars_spent 를 byeolmaru_subscriptions.stars_spent 가 아니라 **star_transactions** 에서
--    센다(플랜과 다름). 1층 admin_layer1_quality.subscription_stars 가 tx 기준이라, 테이블
--    기준으로 세면 같은 창의 "구독 소모 별"이 1층과 2층에서 갈릴 수 있다 — 이 플랜이 없애려는
--    바로 그 정의 드리프트다. 두 소스는 purchase_byeolmaru_subscription 이 한 트랜잭션에서
--    같이 쓰므로 1:1 이다(dev 실측: tx 20 == table 20). 무료별 몫의 분모와 분자가 한 소스에서
--    나온다는 부수 효과도 있다.
--
-- 🔴 만료·활성은 **유저의 마지막 만료시각**으로 센다(플랜과 다름 — 근거 2개).
--    ① 플랜 원안 `expires_at >= p_since AND (p_until IS NULL OR expires_at < p_until)` 은
--       p_until 이 NULL(라우트가 항상 NULL 을 넘긴다)이면 **미래 만료까지 만료로 센다.**
--       dev 실측: 구독 1건이 2026-10-14 만료인데 7d 창에서 expired=1, 같은 표의 active_now=1 —
--       한 행 안에서 "활성이면서 만료"라는 모순이 찍힌다. → `< now()` 상한을 건다.
--       ⚠️ 1층 admin_layer1_quality.subs_expired 에 **같은 결함이 살아 있다**(subsNet 이
--          started − expired 라 순증이 과소로 나온다). 배포된 숫자라 여기서 건드리지 않았다 —
--          별도 판단이 필요하다. 그때까지 1·2층의 '만료'는 정의가 다르고, 화면 note 가 말한다.
--    ② 연장 재구매는 **새 행**을 만든다(purchase_byeolmaru_subscription: 기존 만료에 이어붙여
--       새 행 INSERT). 옛 행의 expires_at 은 그대로 남아 언젠가 now() 를 지나므로, 행 단위로
--       세면 **구독이 끊긴 적 없는 사람도 만료로 잡힌다.** 활성도 같은 이유로 한 사람이 2로
--       셰진다. → 유저별 MAX(expires_at) 하나로 접는다. 재구독하면 MAX 가 미래로 밀려 자동으로
--       만료에서 빠진다.
--
-- 🔴 방문일은 **구독 기간 안**만 센다(플랜 원안은 창 필터가 없어 구독 전·만료 후 방문까지
--    전부 셌다 — dev 실측 16.0일 vs 구독 기간 기준 7.0일, 2.3배). 그러면 "구독 기간에 실제로
--    왔나"를 못 읽는다.
--    ⚠️ 평균만 주면 분모가 왜곡된다 — 오늘 산 구독자는 아직 하루치밖에 없는데 30일 구독자와
--       같은 무게로 평균에 들어간다. 그래서 pooled 분자·분모(visit_days / sub_days)를 같이
--       준다: sub_days = 구독이 살아 있던 **달력일(KST)** 수 = 방문이 셀 수 있었던 날의 모수라
--       visit_days ≤ sub_days 가 구조적으로 보장되고, 비율이 곧 "구독일 중 온 날"이다.
--       비율 계산은 앱이 pct1 로 한다(SQL 에서 나누면 유닛으로 못 잠근다).
--    ⚠️ 같은 유저가 창 안에서 두 번 사면 행마다 창을 잡을 때 방문일이 겹쳐 이중으로 세진다
--       → 유저당 [MIN(started_at), MAX(LEAST(expires_at, now()))) 하나로 병합한다.
--       연장은 항상 만료를 뒤로 미므로 이 병합이 곧 합집합이다.
--    ⚠️ page_views.user_id 는 nullable 이지만 여기선 구독자 id 와 **등치 비교**라 NULL 은
--       자연히 빠진다(3값 논리 함정 없음). is_bot 은 NOT NULL DEFAULT false.
CREATE OR REPLACE FUNCTION admin_layer2_subscription(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (
  started BIGINT,
  subscribers BIGINT,
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
