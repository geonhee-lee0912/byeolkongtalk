-- 어드민 트래픽 집계 RPC (2026-07-29)
-- 원칙: 어드민 집계는 원본 행을 앱으로 끌어오지 않는다. 반환 행수가 데이터량과 무관하게
-- 고정되므로 Supabase `Max rows` cap 개념 자체가 소멸한다.
-- 설계 정본: docs/superpowers/specs/2026-07-29-admin-aggregation-rpc-and-visitor-mix-design.md
--
-- 재현하는 규칙 4가지 (드리프트 주의 — 원본은 lib/analytics/traffic.ts):
--  1) 오전 10시 롤오버 — (created_at at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date
--     ⚠️ /admin/analytics 트렌드와 연애 일일 턴은 KST 자정 기준. 섞지 말 것.
--     ⚠️ `at time zone 'UTC'` 를 빼면 timestamptz::date 캐스트가 **세션 TimeZone 에 좌우된다**.
--        현재 prod 세션은 UTC 라 결과가 같지만(실측 불일치 0행) 그건 런타임 설정이지 보장이 아니다.
--        JS 쪽 adminKstDate 는 .toISOString() = 항상 UTC 기준이므로 여기서 UTC 를 못박아 맞춘다.
--  2) 봇 제외 is_bot = false. 단 admin_traffic_bot 은 봇 포함이 분모 — 유일한 예외.
--     (is_bot 은 NOT NULL DEFAULT false 라 JS 의 `!r.is_bot` 과 동치다)
--  3) 어드민 제외 — page_views 는 비로그인 행의 user_id 가 NULL 이라 NOT IN 단독은 SQL
--     3값 논리로 비로그인 행을 전멸시킨다. 반드시 (user_id is null or user_id <> all(...)).
--  4) first-touch 귀속 — anon_id 의 가장 이른 값으로 그 방문자의 모든 행을 귀속.

-- ── 유입값 정규화 (JS normalizeEntryValue + DIRECT 폴백을 합친 것) ──
-- {{ad.name}} 형태는 Meta 매크로가 치환되지 않고 리터럴로 도착한 것 = 실제 소재가 아니다.
-- 빈 문자열도 '(직접/오가닉)' 으로 접는다 — JS 는 `own ? … : DIRECT` 로 '' 를 falsy 처리한다.
-- 현재 데이터에 '' 는 0건이지만 컬럼이 nullable text 라 구조적으로 들어올 수 있다.
-- 공백만 있는 문자열('   ')은 JS 에서 truthy 라 접지 않는다 — 일부러 btrim 이 아니라 = '' 다.
CREATE OR REPLACE FUNCTION admin_normalize_entry(p_val TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_val IS NULL OR p_val = '' THEN '(직접/오가닉)'
    WHEN btrim(p_val) ~ '^\{\{.*\}\}$' THEN '(매크로 미치환)'
    ELSE p_val
  END;
$$;

-- ── 1. 일별 UV/PV 추세 ──
-- 날짜 축 0 채우기는 앱이 한다(fillTrafficAxis) — 수집이 끊긴 날을 0 으로 보이게 하는 것이
-- 목적이고, 기존 순수 함수 로직을 재사용하는 편이 안전하다.
CREATE OR REPLACE FUNCTION admin_traffic_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, uv BIGINT, pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ((created_at AT TIME ZONE 'UTC' + interval '9 hours' - interval '10 hours')::date),
         count(DISTINCT anon_id),
         count(*)
  FROM page_views
  WHERE created_at >= p_since
    AND is_bot = false
    AND (user_id IS NULL OR user_id <> ALL(p_exclude))
  GROUP BY 1 ORDER BY 1;
$$;

-- ── 2. 방문자 구성 (신규 / 연속 / 복귀) ──
-- 🔴 prev 계산은 조회창에 의존해선 안 된다. 창 안에서만 lag 하면 ①창 밖에 첫 방문이 있던
--    방문자가 신규로 오분류되고 ②가장 오래된 버킷의 연속/복귀 구분이 전부 틀린다.
--    그래서 lag 를 전체 테이블에 돌린 뒤 창 필터를 나중에 건다.
-- ⚠️ 봇·어드민 제외를 여기서도 동일 적용해야 한다. 안 걸면 봇으로 오분류된 하루나 운영자로
--    돌아본 날이 그 anon_id 의 첫 방문이 되어 실제 사람의 첫 방문이 영원히 "복귀"로 잡힌다.
-- prev IS NULL 은 아래 두 filter 에서 자동 제외되므로 3분할 합 = uv 가 성립한다.
CREATE OR REPLACE FUNCTION admin_traffic_visitor_mix(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, uv BIGINT, new_uv BIGINT, streak_uv BIGINT, back_uv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- ⚠️ 본문 컬럼은 전부 별칭 수식한다(lg.bucket 등). RETURNS TABLE 의 bucket 이 OUT 파라미터로
  --    본문 스코프에 들어와 CTE 컬럼과 이름이 겹치기 때문 — 수식하면 해석이 결정적이다.
  WITH visits AS (
    SELECT DISTINCT v.anon_id AS anon_id,
           ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours' - interval '10 hours')::date) AS bucket
    FROM page_views v
    WHERE v.anon_id IS NOT NULL
      AND v.is_bot = false
      AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  ), lagged AS (
    SELECT vs.anon_id AS anon_id, vs.bucket AS bucket,
           lag(vs.bucket) OVER (PARTITION BY vs.anon_id ORDER BY vs.bucket) AS prev
    FROM visits vs
  )
  SELECT lg.bucket,
         count(*),
         count(*) FILTER (WHERE lg.prev IS NULL),
         count(*) FILTER (WHERE lg.prev = lg.bucket - 1),
         count(*) FILTER (WHERE lg.prev < lg.bucket - 1)
  FROM lagged lg
  WHERE lg.bucket >= ((p_since AT TIME ZONE 'UTC' + interval '9 hours' - interval '10 hours')::date)
  GROUP BY lg.bucket ORDER BY lg.bucket;
$$;

-- ── 3. 라우트별 UV·PV + 오늘 열 ──
-- 순위는 PV 내림차순 유지(표시 순서 UV·PV 와 별개). 오늘 값으로 재정렬하면 순위가 매 시간
-- 흔들려 "어느 라우트에서 새는가"를 못 읽는다.
-- "오늘만 활동하고 기간 상위 N 밖인 라우트는 표에 안 나온다" 는 현행 동작을 유지한다.
CREATE OR REPLACE FUNCTION admin_traffic_routes(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_today DATE, p_limit INT DEFAULT 20
)
RETURNS TABLE (path TEXT, uv BIGINT, pv BIGINT, today_uv BIGINT, today_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.path,
         count(DISTINCT v.anon_id),
         count(*),
         count(DISTINCT v.anon_id) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours' - interval '10 hours')::date) = p_today),
         count(*) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours' - interval '10 hours')::date) = p_today)
  FROM page_views v
  WHERE v.created_at >= p_since
    AND v.is_bot = false
    AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  GROUP BY v.path
  ORDER BY count(*) DESC, count(DISTINCT v.anon_id) DESC
  LIMIT p_limit;
$$;

-- ── 4. 로그인 전/후 ──
-- 빈 데이터에서도 두 행을 항상 반환한다(화면 표가 사라지지 않게) → segments 를 좌변에 두고 LEFT JOIN.
-- 주의: 같은 anon_id 가 가입 순간 양쪽에 나타나므로 두 UV 합은 전체 UV 보다 클 수 있다(정상).
-- count(v.id) 여야 한다 — count(*) 면 매칭 0인 세그먼트가 0 이 아니라 1 로 나온다.
CREATE OR REPLACE FUNCTION admin_traffic_auth(p_since TIMESTAMPTZ, p_exclude UUID[], p_today DATE)
RETURNS TABLE (segment TEXT, uv BIGINT, pv BIGINT, today_uv BIGINT, today_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.segment,
         count(DISTINCT v.anon_id),
         count(v.id),
         count(DISTINCT v.anon_id) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours' - interval '10 hours')::date) = p_today),
         count(v.id) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours' - interval '10 hours')::date) = p_today)
  FROM (VALUES ('guest'), ('member')) AS s(segment)
  LEFT JOIN page_views v
    ON (CASE WHEN v.user_id IS NULL THEN 'guest' ELSE 'member' END) = s.segment
   AND v.created_at >= p_since
   AND v.is_bot = false
   AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  GROUP BY s.segment
  ORDER BY s.segment;
$$;

-- ── 5. 유입별 (first-touch 귀속) ──
-- p_field: 'landing_variant' 또는 'utm_content'. 두 필드는 독립적으로 first-touch 한다
-- (같은 행일 필요 없음).
-- ⚠️ 창 안 first-touch = 현행 buildEntrySources 동작. 창 밖까지 보도록 "개선"하면
--    before/after 대조가 깨져 검증 자체가 불가능해진다. 개선은 별건.
--
-- 🔴 "오늘" 열이 없다 (2026-07-29 사용자 결정). 이 표에서만 오늘 열의 뜻이 모호했다:
--    30일 first-touch 키를 그대로 쓰면 "오늘 움직인 사람의 출신", 오늘 행만으로 first-touch 를
--    다시 계산하면(현행 JS) "오늘 광고 타고 들어온 사람" — 두 정의가 다른 값을 낸다.
--    후자는 광고 유입자가 오가닉으로 재방문할수록 소재 행이 0 이 되고 (직접/오가닉) 이 부풀어
--    "오가닉이 늘었다" 로 오독된다. 재방문율이 오르는 중이라 왜곡은 커지기만 한다.
--    둘 중 하나를 고르는 대신 열을 없앴다 — 애매한 지표를 남기느니 안 보여주는 게 낫고,
--    일일 광고 유입은 Meta 광고관리자와 /admin/ads 가 이미 본다.
--    (routes·auth 의 오늘 열은 정의가 하나뿐이라 그대로 유지한다)
-- ⚠️ Postgres 에 IGNORE NULLS 가 없어 first_value 대신 array_agg 후 첫 원소를 취한다.
--    nullif(val,'') = JS 가 `if (r.landing_variant && …)` 로 빈 문자열을 건너뛰는 것과 동치.
--    ORDER BY 에 id 를 더한 건 같은 created_at 동률에서 결과를 결정적으로 만들기 위함이다.
-- anon_id 없는 행은 귀속 불가 → 자기 행 값으로 PV 만 기여(count(DISTINCT anon_id) 가 NULL 을
-- 세지 않으므로 UV 미계상이 자동으로 성립).
-- 🔴 p_limit 이 필수다. 이 RPC 는 반환 행수가 **소재 카디널리티에 비례**하는 유일한 것이고,
--    RPC 결과도 PostgREST 를 지나므로 `Max rows` cap 이 그대로 적용된다 — 상한을 안 박으면
--    "RPC 로 바꿨는데 또 조용히 잘리는" 사고가 재발한다. 기본 200 은 현실 소재 수(수십)의
--    훨씬 위이면서 cap 의 아래다. 상한 도달은 앱이 경고로 드러낸다(조용한 절단 금지).
CREATE OR REPLACE FUNCTION admin_traffic_entry(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_field TEXT, p_limit INT DEFAULT 200
)
RETURNS TABLE (key TEXT, uv BIGINT, pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- ⚠️ 본문 컬럼은 전부 별칭 수식한다(k.key 등). RETURNS TABLE 의 key 가 OUT 파라미터로
  --    본문 스코프에 들어와 CTE 컬럼과 이름이 겹치기 때문 — 수식하면 해석이 결정적이다.
  WITH src AS (
    SELECT v.id AS id,
           v.anon_id AS anon_id,
           v.created_at AS created_at,
           CASE WHEN p_field = 'landing_variant' THEN v.landing_variant ELSE v.utm_content END AS val
    FROM page_views v
    WHERE v.created_at >= p_since
      AND v.is_bot = false
      AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  ), first_touch AS (
    SELECT s.anon_id AS anon_id,
           (array_remove(array_agg(nullif(s.val, '') ORDER BY s.created_at, s.id), NULL))[1] AS first_val
    FROM src s WHERE s.anon_id IS NOT NULL GROUP BY s.anon_id
  ), keyed AS (
    SELECT s.anon_id AS anon_id,
           admin_normalize_entry(
             CASE WHEN s.anon_id IS NULL THEN s.val ELSE f.first_val END
           ) AS key
    FROM src s LEFT JOIN first_touch f ON f.anon_id = s.anon_id
  )
  SELECT k.key,
         count(DISTINCT k.anon_id),
         count(*)
  FROM keyed k
  GROUP BY k.key
  -- (직접/오가닉) 은 대개 압도적이라 맨 위에 두면 소재 행이 안 보인다 → 맨 아래로.
  -- (매크로 미치환) 은 내리지 않는다(현행과 동일).
  ORDER BY (k.key = '(직접/오가닉)'), count(DISTINCT k.anon_id) DESC, count(*) DESC
  LIMIT p_limit;
$$;

-- ── 6. 봇 비율 (계측 건강성) ──
-- 유일하게 is_bot 필터가 없다 — 봇 포함 전체가 분모여야 비율이 의미를 갖는다.
CREATE OR REPLACE FUNCTION admin_traffic_bot(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (total_pv BIGINT, bot_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*), count(*) FILTER (WHERE is_bot)
  FROM page_views
  WHERE created_at >= p_since
    AND (user_id IS NULL OR user_id <> ALL(p_exclude));
$$;

-- ── 권한: service_role 전용 (게이트는 라우트의 requireAdmin 이 담당) ──
-- 🔴 함수는 기본적으로 PUBLIC 에 EXECUTE 가 있고 이 함수들은 SECURITY DEFINER 다.
--    REVOKE 를 빠뜨리면 anon 키만으로 어드민 집계 전체를 읽을 수 있다.
--    시그니처를 전부 명시한다 — 이름만 쓰면 오버로드가 생겼을 때 조용히 대상이 어긋난다.
REVOKE EXECUTE ON FUNCTION admin_normalize_entry(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_visitor_mix(TIMESTAMPTZ, UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_routes(TIMESTAMPTZ, UUID[], DATE, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_auth(TIMESTAMPTZ, UUID[], DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_entry(TIMESTAMPTZ, UUID[], TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_bot(TIMESTAMPTZ, UUID[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_normalize_entry(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_trend(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_visitor_mix(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_routes(TIMESTAMPTZ, UUID[], DATE, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_auth(TIMESTAMPTZ, UUID[], DATE) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_entry(TIMESTAMPTZ, UUID[], TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_bot(TIMESTAMPTZ, UUID[]) TO service_role;
