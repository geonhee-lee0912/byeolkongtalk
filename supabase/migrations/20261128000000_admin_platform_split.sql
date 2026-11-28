-- 어드민 앱/웹 구분 + 그 기간 실제 결제자 (2026-11-28)
-- 설계: docs/superpowers/specs/2026-11-28-어드민-앱웹-구분-design.md
--
-- 새 읽기 전용 집계 RPC 3개. 기존 RPC·표는 건드리지 않는다.
--   1) admin_platform_daily   — KST 날짜별 방문·가입·결제를 앱/웹으로 (트래픽 화면)
--   2) admin_platform_summary — 같은 열을 기간 한 행으로 (대시보드 오늘·어제·최근 7일)
--   3) admin_period_payers    — 그 기간 결제한 사람 전체를 신규/기존/재결제/탈퇴로 (대시보드)
--
-- 정의
-- - 앱 방문 = page_views.browser_env = 'app'(앱 웹뷰 UA 꼬리). 웹 = 그 외 전부 — NULL 포함
--   (NULL 은 UA 없는 요청이라 앱일 수 없다). 봇 제외. IS DISTINCT FROM 으로 NULL 을 웹에 넣는다
--   — `<> 'app'` 이면 NULL 행이 3값 논리로 사라진다.
-- - 가입 앱/웹 = 가입 시각 이후 24시간 안, 그 회원의 첫 방문 기록(봇 제외)의 browser_env.
--   기록이 없으면 '모름'. 불변식: app + web + unknown = 그날 가입 수.
-- - 결제 = status 'completed'(환불 제외 — 대시보드 다른 결제 숫자와 같은 기준). 결제 시각 KST 날짜.
--   수단은 tosspayments·apple·google 셋만 FILTER 로 센다.
-- - 어드민 제외는 기존 admin_traffic_trend·admin_pay_rate 와 같다.
-- - 방문 UV: daily = 그날 서로 다른 anon_id, summary = 기간 안 서로 다른 anon_id(하루 UV 합이 아니다).
--   한 anon_id 가 앱·웹 둘 다 찍히면 양쪽에 1씩 — 앱 UV + 웹 UV ≥ 전체 UV 일 수 있다.

CREATE OR REPLACE FUNCTION admin_platform_daily(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (
  d DATE,
  uv_app BIGINT, uv_web BIGINT, pv_app BIGINT, pv_web BIGINT,
  signups_app BIGINT, signups_web BIGINT, signups_unknown BIGINT,
  pay_toss BIGINT, pay_apple BIGINT, pay_google BIGINT,
  won_toss BIGINT, won_apple BIGINT, won_google BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ex AS (SELECT COALESCE(p_exclude, '{}'::uuid[]) AS ids),
  v AS (
    SELECT (pv.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date AS d,
           count(DISTINCT pv.anon_id) FILTER (WHERE pv.browser_env = 'app') AS uv_app,
           count(DISTINCT pv.anon_id) FILTER (WHERE pv.browser_env IS DISTINCT FROM 'app') AS uv_web,
           count(*) FILTER (WHERE pv.browser_env = 'app') AS pv_app,
           count(*) FILTER (WHERE pv.browser_env IS DISTINCT FROM 'app') AS pv_web
    FROM page_views pv CROSS JOIN ex
    WHERE pv.created_at >= p_since
      AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(ex.ids))
    GROUP BY 1
  ),
  s AS (
    SELECT (u.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date AS d,
           count(*) FILTER (WHERE f.found AND f.browser_env = 'app') AS signups_app,
           count(*) FILTER (WHERE f.found AND f.browser_env IS DISTINCT FROM 'app') AS signups_web,
           count(*) FILTER (WHERE f.found IS NULL) AS signups_unknown
    FROM users u
    CROSS JOIN ex
    LEFT JOIN LATERAL (
      SELECT true AS found, pv.browser_env
      FROM page_views pv
      WHERE pv.user_id = u.id
        AND pv.is_bot = false
        AND pv.created_at >= u.created_at
        AND pv.created_at < u.created_at + INTERVAL '24 hours'
      ORDER BY pv.created_at
      LIMIT 1
    ) f ON true
    WHERE u.created_at >= p_since
      AND u.id <> ALL(ex.ids)
    GROUP BY 1
  ),
  p AS (
    SELECT (p.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date AS d,
           count(*) FILTER (WHERE p.pg_provider = 'tosspayments') AS pay_toss,
           count(*) FILTER (WHERE p.pg_provider = 'apple') AS pay_apple,
           count(*) FILTER (WHERE p.pg_provider = 'google') AS pay_google,
           COALESCE(sum(p.amount_won) FILTER (WHERE p.pg_provider = 'tosspayments'), 0) AS won_toss,
           COALESCE(sum(p.amount_won) FILTER (WHERE p.pg_provider = 'apple'), 0) AS won_apple,
           COALESCE(sum(p.amount_won) FILTER (WHERE p.pg_provider = 'google'), 0) AS won_google
    FROM payments p CROSS JOIN ex
    WHERE p.status = 'completed'
      AND p.created_at >= p_since
      AND (p.user_id IS NULL OR p.user_id <> ALL(ex.ids))
    GROUP BY 1
  ),
  days AS (SELECT d FROM v UNION SELECT d FROM s UNION SELECT d FROM p)
  SELECT days.d,
         COALESCE(v.uv_app, 0)::BIGINT, COALESCE(v.uv_web, 0)::BIGINT,
         COALESCE(v.pv_app, 0)::BIGINT, COALESCE(v.pv_web, 0)::BIGINT,
         COALESCE(s.signups_app, 0)::BIGINT, COALESCE(s.signups_web, 0)::BIGINT,
         COALESCE(s.signups_unknown, 0)::BIGINT,
         COALESCE(p.pay_toss, 0)::BIGINT, COALESCE(p.pay_apple, 0)::BIGINT, COALESCE(p.pay_google, 0)::BIGINT,
         COALESCE(p.won_toss, 0)::BIGINT, COALESCE(p.won_apple, 0)::BIGINT, COALESCE(p.won_google, 0)::BIGINT
  FROM days
  LEFT JOIN v ON v.d = days.d
  LEFT JOIN s ON s.d = days.d
  LEFT JOIN p ON p.d = days.d
  ORDER BY days.d;
$$;

-- 기간 한 행. 집계에 GROUP BY 가 없어 값이 없어도 늘 한 행(0)이 나온다.
CREATE OR REPLACE FUNCTION admin_platform_summary(p_since TIMESTAMPTZ, p_until TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (
  uv_app BIGINT, uv_web BIGINT, pv_app BIGINT, pv_web BIGINT,
  signups_app BIGINT, signups_web BIGINT, signups_unknown BIGINT,
  pay_toss BIGINT, pay_apple BIGINT, pay_google BIGINT,
  won_toss BIGINT, won_apple BIGINT, won_google BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ex AS (SELECT COALESCE(p_exclude, '{}'::uuid[]) AS ids),
  v AS (
    SELECT count(DISTINCT pv.anon_id) FILTER (WHERE pv.browser_env = 'app') AS uv_app,
           count(DISTINCT pv.anon_id) FILTER (WHERE pv.browser_env IS DISTINCT FROM 'app') AS uv_web,
           count(*) FILTER (WHERE pv.browser_env = 'app') AS pv_app,
           count(*) FILTER (WHERE pv.browser_env IS DISTINCT FROM 'app') AS pv_web
    FROM page_views pv CROSS JOIN ex
    WHERE pv.created_at >= p_since
      AND (p_until IS NULL OR pv.created_at < p_until)
      AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(ex.ids))
  ),
  s AS (
    SELECT count(*) FILTER (WHERE f.found AND f.browser_env = 'app') AS signups_app,
           count(*) FILTER (WHERE f.found AND f.browser_env IS DISTINCT FROM 'app') AS signups_web,
           count(*) FILTER (WHERE f.found IS NULL) AS signups_unknown
    FROM users u
    CROSS JOIN ex
    LEFT JOIN LATERAL (
      SELECT true AS found, pv.browser_env
      FROM page_views pv
      WHERE pv.user_id = u.id
        AND pv.is_bot = false
        AND pv.created_at >= u.created_at
        AND pv.created_at < u.created_at + INTERVAL '24 hours'
      ORDER BY pv.created_at
      LIMIT 1
    ) f ON true
    WHERE u.created_at >= p_since
      AND (p_until IS NULL OR u.created_at < p_until)
      AND u.id <> ALL(ex.ids)
  ),
  p AS (
    SELECT count(*) FILTER (WHERE p.pg_provider = 'tosspayments') AS pay_toss,
           count(*) FILTER (WHERE p.pg_provider = 'apple') AS pay_apple,
           count(*) FILTER (WHERE p.pg_provider = 'google') AS pay_google,
           COALESCE(sum(p.amount_won) FILTER (WHERE p.pg_provider = 'tosspayments'), 0) AS won_toss,
           COALESCE(sum(p.amount_won) FILTER (WHERE p.pg_provider = 'apple'), 0) AS won_apple,
           COALESCE(sum(p.amount_won) FILTER (WHERE p.pg_provider = 'google'), 0) AS won_google
    FROM payments p CROSS JOIN ex
    WHERE p.status = 'completed'
      AND p.created_at >= p_since
      AND (p_until IS NULL OR p.created_at < p_until)
      AND (p.user_id IS NULL OR p.user_id <> ALL(ex.ids))
  )
  SELECT v.uv_app::BIGINT, v.uv_web::BIGINT, v.pv_app::BIGINT, v.pv_web::BIGINT,
         s.signups_app::BIGINT, s.signups_web::BIGINT, s.signups_unknown::BIGINT,
         p.pay_toss::BIGINT, p.pay_apple::BIGINT, p.pay_google::BIGINT,
         p.won_toss::BIGINT, p.won_apple::BIGINT, p.won_google::BIGINT
  FROM v CROSS JOIN s CROSS JOIN p;
$$;

-- 그 기간(결제한 날 기준) completed 결제를 사람별로 묶어 분류한다.
--   new_48h        창 안 가입 + 평생 첫 결제가 가입 후 48시간 안 (admin_pay_rate 가 세는 사람과 거의 같다 —
--                  저쪽은 가입한 날 기준이라 창 경계에서 1~2명 다를 수 있다)
--   new_later      창 안 가입 + 첫 결제가 48시간 뒤
--   existing_first 창 전 가입 + 평생 첫 결제가 창 안
--   repeat         창 전에 이미 결제한 적 있음
--   withdrawn      users 행이 없다(탈퇴로 payments.user_id 가 NULL 이 됐거나 행이 사라짐) — 사람 구분이
--                  안 되므로 people 은 NULL, 건수·금액만.
-- 행이 없는 분류는 내지 않는다 — 화면 변환(lib/admin/platform.ts)이 0 으로 채우고 순서를 고정한다.
CREATE OR REPLACE FUNCTION admin_period_payers(p_since TIMESTAMPTZ, p_until TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (segment TEXT, people BIGINT, payments BIGINT, won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ex AS (SELECT COALESCE(p_exclude, '{}'::uuid[]) AS ids),
  pay AS (
    SELECT p.user_id, p.amount_won, u.created_at AS joined_at
    FROM payments p
    CROSS JOIN ex
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.status = 'completed'
      AND p.created_at >= p_since
      AND (p_until IS NULL OR p.created_at < p_until)
      AND (p.user_id IS NULL OR p.user_id <> ALL(ex.ids))
  ),
  per AS (
    SELECT user_id, joined_at, count(*) AS n, sum(amount_won) AS won
    FROM pay
    WHERE joined_at IS NOT NULL
    GROUP BY user_id, joined_at
  ),
  fp AS (
    SELECT p.user_id, min(p.created_at) AS first_pay
    FROM payments p
    JOIN per ON per.user_id = p.user_id
    WHERE p.status = 'completed'
    GROUP BY p.user_id
  ),
  cls AS (
    SELECT per.n, per.won,
           CASE
             WHEN per.joined_at >= p_since THEN
               CASE WHEN fp.first_pay < per.joined_at + INTERVAL '48 hours' THEN 'new_48h' ELSE 'new_later' END
             WHEN fp.first_pay >= p_since THEN 'existing_first'
             ELSE 'repeat'
           END AS seg
    FROM per
    JOIN fp ON fp.user_id = per.user_id
  )
  SELECT seg, count(*)::BIGINT, sum(n)::BIGINT, sum(won)::BIGINT
  FROM cls
  GROUP BY seg
  UNION ALL
  SELECT 'withdrawn', NULL::BIGINT, count(*)::BIGINT, COALESCE(sum(amount_won), 0)::BIGINT
  FROM pay
  WHERE joined_at IS NULL
  HAVING count(*) > 0;
$$;

-- AGENTS.md: 새 SECURITY DEFINER RPC 는 셋 다 REVOKE + service_role 만.
REVOKE EXECUTE ON FUNCTION admin_platform_daily(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_platform_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_period_payers(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_platform_daily(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_platform_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_period_payers(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
