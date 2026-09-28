-- admin_path_sequences / admin_path_exits — 경로 판독기 (플랜B §6 · Task 13).
--
-- 🔴 새 로깅이 없다. page_views 가 이미 모든 라우트를 anon 단위·시간순으로 들고 있고,
--    부족했던 건 **읽는 화면**이었다. 그래서 §2-6 의 로그인 누수가 두 달 넘게 안 보였다.
--
-- 정의 — 스펙 §2-6 실측과 **같은 정의**다. 바꾸면 그 숫자를 재현할 수 없다:
--   · 단위는 **anon** 이다(세션이 아니다). `anon_id` 쿠키 하나 = 한 사람.
--   · 봇 제외 · `/admin%` 제외 · 첫 p_steps 스텝만 경로 문자열로 접는다.
--   · `rn` 의 ORDER BY 에 `v.id` 타이브레이커가 **필수**다. 같은 초에 찍힌 두 행의 순서가
--     실행마다 달라지면 경로 문자열이 흔들려 같은 창을 두 번 돌린 결과가 갈린다.
--   · 마지막 ORDER BY 에도 타이브레이커(`, 1`)를 둔다 — 동점이 p_limit 경계에 걸리면
--     어느 행이 살아남는지가 미정의라 절단 결과가 실행마다 바뀐다.
--
-- 재현 검증 (2026-09-27 prod, 창 = 2026-08-21 18:00 KST ~ 2026-09-20 18:00 KST, p_steps=4):
--   / → /login → /concern → /tarot   653명 97%   (스펙 653 · 97%)
--   / → /login → / → /login          253명 50%   (스펙 252 · 50%)
--   / → /login                        88명  0%   (스펙  88 ·  0%)
--   / → /login → /                    72명  1%   (스펙  72 ·  1%)
--   / → /login → /login → /           65명 32%   (스펙  65 · 32%)
--   같은 창의 `/login` 도달 anon = **1,531** — 스펙 합계와 정확히 일치.
--   2행의 +1 은 스펙 분석 시각이 09-20 17~18시 사이라는 데까지만 좁혀져 남은 오차다
--   (17시 기준으로 돌리면 그 행이 252 로 맞고 대신 1행이 652 가 된다).
--
-- ⚠️ 반환 행수는 경로 카디널리티에 비례한다(같은 창 distinct 경로 204개) → p_limit 으로 자르고,
--    호출부가 **눈에 보이는** 절단 경고를 그린다(플래그만 두고 안 보여주면 의미가 없다, AGENTS.md).

-- 첫 p_steps 스텝 경로 시퀀스.
--
-- 🔴 어드민 제외는 **anon 단위**다(행 단위가 아니다). 행 단위로 `user_id <> ALL(p_exclude)` 를
--    걸면 어드민 anon 의 로그인 **이전** 행(user_id NULL)만 남아, 그 사람의 잘린 경로가
--    "로그인 화면까지 갔다가 안 하고 나감" 이라는 **없던 행을 만들어낸다** — 안 거르느니만 못하다.
--    anon 단위 제외는 `pv` 를 한 번 더 훑기만 하므로 테이블 스캔이 늘지 않는다.
-- ⚠️ 한계: `p_exclude` 는 user_id 로만 걸린다 → 운영자가 **로그아웃 상태로** QA 하면 못 거른다.
--    실측(2026-09-20 기준 30일): 걸리는 anon 은 1,856명 중 5명(0.27%)이고 상위 경로 8개는
--    전부 0명이라, 제외를 켜도 위 재현값은 바뀌지 않는다.
CREATE OR REPLACE FUNCTION admin_path_sequences(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_steps INT,
  p_limit INT,
  p_exclude UUID[]
)
RETURNS TABLE (seq TEXT, people BIGINT, logged_in BIGINT, paid BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pv AS (
    SELECT v.anon_id, v.path, v.user_id,
           ROW_NUMBER() OVER (PARTITION BY v.anon_id ORDER BY v.created_at, v.id) AS rn
    FROM page_views v
    WHERE v.anon_id IS NOT NULL
      AND NOT COALESCE(v.is_bot, false)
      AND v.path NOT LIKE '/admin%'
      AND v.created_at >= p_since
      AND (p_until IS NULL OR v.created_at < p_until)
  ), excluded_anons AS (
    SELECT DISTINCT p.anon_id FROM pv p WHERE p.user_id = ANY(p_exclude)
  ), head AS (
    SELECT p.anon_id, string_agg(p.path, ' → ' ORDER BY p.rn) AS seq
    FROM pv p
    WHERE p.rn <= p_steps
      AND NOT EXISTS (SELECT 1 FROM excluded_anons x WHERE x.anon_id = p.anon_id)
    GROUP BY p.anon_id
  ), logged_anons AS (
    -- 로그인 도달 = 그 anon 의 어떤 page_view 에든 user_id 가 붙었다(첫 N스텝 밖이어도 센다).
    SELECT DISTINCT p.anon_id FROM pv p WHERE p.user_id IS NOT NULL
  ), paid_anons AS (
    -- 🔴 상관 서브쿼리로 쓰면 anon 마다 page_views ⋈ payments 를 다시 돈다. 한 번에 집합으로
    --    만들어 IN 으로 붙인다.
    -- anon→user 연결은 **창 안에서** 본 것만 쓴다(`pv` 재사용) — 결제 시점 자체는 제한이 없다.
    --    이유 3개:
    --    ① 위 `logged_anons` 가 창 스코프다. 이쪽만 전 기간이면 같은 표의 두 플래그가 서로
    --       다른 창을 재게 된다.
    --    ② 값이 같다. 2026-09-27 prod 실측 — 화면이 실제로 쓰는 **열린 창**(p_until NULL)에서
    --       page_views 전체를 훑는 형태와 차이 0행(7일 27=27 · 30일 111=111).
    --    ③ 싸다. 7일 창 31.0ms/6,295버퍼 → 13.7ms/2,296버퍼 (30일 67.6→60.0ms).
    -- ⚠️ 단, `p_until` 을 닫은 **과거 창**에서는 갈릴 수 있다 — 창이 끝난 뒤에야 로그인한 anon 을
    --    전 기간 형태는 소급해서 결제자로 센다(§2-6 창 실측: 1,856명 중 1명). 창 밖 미래를
    --    끌어오지 않는 이쪽이 과거 창 판독으로도 맞다.
    SELECT DISTINCT p.anon_id
    FROM pv p
    JOIN payments pay ON pay.user_id = p.user_id AND pay.status = 'completed'
  ), flag AS (
    SELECT h.seq,
           (h.anon_id IN (SELECT anon_id FROM logged_anons)) AS did_login,
           (h.anon_id IN (SELECT anon_id FROM paid_anons)) AS did_pay
    FROM head h
  )
  SELECT flag.seq,
         COUNT(*)::BIGINT,
         COUNT(*) FILTER (WHERE did_login)::BIGINT,
         COUNT(*) FILTER (WHERE did_pay)::BIGINT
  FROM flag
  GROUP BY flag.seq
  ORDER BY 2 DESC, 1
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION admin_path_sequences(TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_path_sequences(TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, UUID[]) TO service_role;

-- 이탈 지점 — 그 anon 이 창 안에서 **마지막으로 본** path 의 분포.
CREATE OR REPLACE FUNCTION admin_path_exits(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_limit INT,
  p_exclude UUID[]
)
RETURNS TABLE (path TEXT, people BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pv AS (
    SELECT v.anon_id, v.path, v.user_id, v.created_at, v.id
    FROM page_views v
    WHERE v.anon_id IS NOT NULL
      AND NOT COALESCE(v.is_bot, false)
      AND v.path NOT LIKE '/admin%'
      AND v.created_at >= p_since
      AND (p_until IS NULL OR v.created_at < p_until)
  ), excluded_anons AS (
    SELECT DISTINCT p.anon_id FROM pv p WHERE p.user_id = ANY(p_exclude)
  ), last_pv AS (
    SELECT DISTINCT ON (p.anon_id) p.anon_id, p.path
    FROM pv p
    WHERE NOT EXISTS (SELECT 1 FROM excluded_anons x WHERE x.anon_id = p.anon_id)
    ORDER BY p.anon_id, p.created_at DESC, p.id DESC
  )
  SELECT last_pv.path, COUNT(*)::BIGINT
  FROM last_pv
  GROUP BY last_pv.path
  ORDER BY 2 DESC, 1
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION admin_path_exits(TIMESTAMPTZ, TIMESTAMPTZ, INT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_path_exits(TIMESTAMPTZ, TIMESTAMPTZ, INT, UUID[]) TO service_role;
