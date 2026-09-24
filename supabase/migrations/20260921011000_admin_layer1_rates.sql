-- admin_layer1_unit / admin_layer1_guard — 1층의 단가 분해와 가드레일 6종.
--
-- 🔴 비율을 만들지 않는다. num/den 원시값만 준다 — 산식은 lib/admin/layer1.ts 가 갖고,
--    den 은 소표본 게이트의 n 으로도 쓰인다. SQL 이 round() 해버리면 그 n 을 잃는다.

-- ── 단가 (가입 코호트 귀속) ────────────────────────────────────────────────
-- 🔴 코호트 귀속이다 — 창에 **가입한** 사람이 **전 기간** 낸 매출. 캘린더 귀속(창에 발생한
--    매출 ÷ 창의 가입자)과 다르며, 2026-09-19 분석이 코호트로 정정했다(스펙 §7).
-- ⚠️ 탈퇴자는 users 행이 사라져 코호트에서 빠진다. 그 사람의 결제는 payments 에 익명으로
--    남지만 이 창에는 안 잡힌다 — 코호트 지표의 구조적 한계다(화면 caveat 에 있음).
-- ⚠️ p_since·p_until 은 **KST 자정**이어야 한다(`lib/admin-time.ts` 의 daysAgoKstIso 가 보장).
--    ad 는 날짜 비교, 나머지는 타임스탬프 비교라 자정이 아니면 첫날 버킷이 비대칭이 된다.
CREATE OR REPLACE FUNCTION admin_layer1_unit(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (signups BIGINT, payers BIGINT, revenue_won BIGINT, ad_spend_won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH coh AS (
    SELECT u.id
    FROM users u
    WHERE u.created_at >= p_since
      AND (p_until IS NULL OR u.created_at < p_until)
      AND u.id <> ALL(p_exclude)
  ), pay AS (
    SELECT p.user_id, SUM(p.amount_won)::BIGINT AS won
    FROM payments p
    JOIN coh ON coh.id = p.user_id
    WHERE p.status = 'completed'
    GROUP BY 1
  ), ad AS (
    -- ⚠️ 광고비는 수기 입력이라 최근 며칠이 비어 있을 수 있다(2026-09-24 실측: 5일 공백).
    --    그만큼 CAC 가 과소로 나온다. 입력 지연 신호는 admin_layer1_pnl 의 ad_rows 가 주고
    --    화면이 그걸로 경고한다 — 여기서 중복으로 내지 않는다.
    SELECT COALESCE(SUM(a.spend_won), 0)::BIGINT AS won
    FROM ad_spend a
    WHERE a.spend_date >= (p_since AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date
      AND (p_until IS NULL
           OR a.spend_date < (p_until AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date)
  )
  SELECT (SELECT COUNT(*) FROM coh)::BIGINT,
         (SELECT COUNT(*) FROM pay)::BIGINT,
         (SELECT COALESCE(SUM(won), 0) FROM pay)::BIGINT,
         (SELECT won FROM ad);
$$;

REVOKE ALL ON FUNCTION admin_layer1_unit(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer1_unit(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;

-- ── 가드레일 6종 ───────────────────────────────────────────────────────────
-- 반환은 (metric, num, den) 의 긴 형식이다. 지표마다 컬럼을 만들면 하나 추가할 때마다
-- 시그니처가 바뀌고 앱의 타입이 따라 흔들린다.
-- 카운트 지표(new_error_classes · unreviewed_sensitive)는 den = 0 으로 온다.
--
-- ⚠️ 창 적용이 지표마다 다르고 그게 의도된 것이다:
--   · 코호트 3종(첫리딩·결과열람·결제완료)은 창 기반
--   · 로그인 성공률은 창 기반(anon 단위라 코호트가 아니다)
--   · 신규 에러 클래스는 **최근 24시간 고정** — "지금 뭔가 터졌나"를 묻는 지표다
--   · 미검토 민감알림은 **현재 상태** — 창 개념이 없다
-- ⚠️ p_since·p_until 은 **KST 자정**이어야 한다(`lib/admin-time.ts` 의 daysAgoKstIso 가 보장).
CREATE OR REPLACE FUNCTION admin_layer1_guard(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (metric TEXT, num BIGINT, den BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH coh AS (
    SELECT u.id
    FROM users u
    WHERE u.created_at >= p_since
      AND (p_until IS NULL OR u.created_at < p_until)
      AND u.id <> ALL(p_exclude)
  ), first_reading AS (
    -- 유저당 첫 리딩 1행. DISTINCT ON 은 ORDER BY 의 선두가 파티션 키여야 한다.
    -- 타이브레이커 r.id — (user_id, created_at) 동률이면 실행마다 다른 행이 뽑힌다.
    --   현재 prod 에 동률 0건이지만, 한 트랜잭션에서 리딩 2건을 만드는 경로가 생기면
    --   now() 가 고정값이라 바로 재현된다.
    SELECT DISTINCT ON (r.user_id) r.user_id, r.stars_spent, r.result_viewed_at
    FROM readings r
    JOIN coh ON coh.id = r.user_id
    ORDER BY r.user_id, r.created_at, r.id
  ), login_reach AS (
    -- /login 을 본 비봇 anon. 어드민 제외를 걸지 않는다 — 분모가 anon 단위라 판별이 불가능하고,
    -- 분자에만 걸면 비율이 구조적으로 낮아진다(같은 규칙을 양쪽에 거는 쪽을 택했다).
    SELECT DISTINCT pv.anon_id
    FROM page_views pv
    WHERE pv.path = '/login'
      AND pv.anon_id IS NOT NULL
      AND NOT COALESCE(pv.is_bot, false)
      AND pv.created_at >= p_since
      AND (p_until IS NULL OR pv.created_at < p_until)
  ), login_ok AS (
    SELECT DISTINCT pv.anon_id
    FROM page_views pv
    JOIN login_reach lr ON lr.anon_id = pv.anon_id
    WHERE pv.user_id IS NOT NULL
      AND NOT COALESCE(pv.is_bot, false)
      AND pv.created_at >= p_since
      AND (p_until IS NULL OR pv.created_at < p_until)
  ), checkout_started AS (
    SELECT DISTINCT e.user_id
    FROM ui_events e
    WHERE e.event = 'recharge_payment_started'
      AND e.user_id IS NOT NULL
      AND e.created_at >= p_since
      AND (p_until IS NULL OR e.created_at < p_until)
      AND e.user_id <> ALL(p_exclude)
  ), checkout_done AS (
    SELECT cs.user_id
    FROM checkout_started cs
    WHERE EXISTS (
      SELECT 1 FROM payments p
      WHERE p.user_id = cs.user_id
        AND p.status = 'completed'
        AND p.created_at >= p_since
        AND (p_until IS NULL OR p.created_at < p_until)
    )
  ), error_classes AS (
    -- 그룹 키는 /admin/errors 화면과 같은 규칙: fingerprint, 없으면 행 자체가 한 그룹.
    SELECT COALESCE(e.fingerprint, e.id::text) AS k, MIN(e.created_at) AS first_at
    FROM error_logs e
    WHERE e.level = 'error'
    GROUP BY 1
  )
  SELECT 'first_reading_rate'::TEXT,
         -- first_reading 은 코호트의 첫 리딩을 유저당 1행 담으므로 COUNT(*) 이 곧 "리딩 1건
         -- 이상인 코호트 수" 다. EXISTS 재조회와 값이 같음을 prod 대조로 확인했다(둘 다 779).
         (SELECT COUNT(*) FROM first_reading)::BIGINT,
         (SELECT COUNT(*) FROM coh)::BIGINT
  UNION ALL
  SELECT 'result_viewed'::TEXT,
         (SELECT COUNT(result_viewed_at) FROM first_reading WHERE stars_spent > 0)::BIGINT,
         (SELECT COUNT(*) FROM first_reading WHERE stars_spent > 0)::BIGINT
  UNION ALL
  SELECT 'login_success_rate'::TEXT,
         (SELECT COUNT(*) FROM login_ok)::BIGINT,
         (SELECT COUNT(*) FROM login_reach)::BIGINT
  UNION ALL
  SELECT 'checkout_completion'::TEXT,
         (SELECT COUNT(*) FROM checkout_done)::BIGINT,
         (SELECT COUNT(*) FROM checkout_started)::BIGINT
  UNION ALL
  SELECT 'new_error_classes'::TEXT,
         (SELECT COUNT(*) FROM error_classes WHERE first_at >= now() - INTERVAL '24 hours')::BIGINT,
         0::BIGINT
  UNION ALL
  SELECT 'unreviewed_sensitive'::TEXT,
         (SELECT COUNT(*) FROM sensitive_alerts WHERE reviewed_at IS NULL)::BIGINT,
         0::BIGINT;
$$;

REVOKE ALL ON FUNCTION admin_layer1_guard(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer1_guard(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
