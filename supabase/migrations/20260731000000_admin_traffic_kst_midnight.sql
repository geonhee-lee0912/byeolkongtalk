-- 어드민 트래픽 RPC — 날짜 기준을 KST 자정으로 통일 + 방문일을 세션 시작에 귀속 (2026-07-31)
--
-- 왜: 20260729000000 은 오전 10시 롤오버를 썼다. 그래서 /admin·/admin/traffic 의 "오늘"과
-- /admin/analytics·연애 일일 턴의 "오늘"이 **다른 날**을 뜻했고, 판독을 두 번 오독하게 만들었다.
-- 10시의 명목상 근거("밤사이 한 세션이 두 날짜로 쪼개지는 것 방지")는 prod 실측으로 기각됐다:
--   · 자정을 걸치는 세션 = 325건 중 2건 (0.62%)  ← 막으려던 문제가 사실상 없다
--   · 반대로 10시 버킷은 **캘린더 날짜와 어긋난 이틀 걸친 창**이라 distinct UV 를 부풀렸다
--     (2026-07-25 실측: 10시 63 vs 자정 27 = 2.3배)
--   · 자정은 Meta 광고 리포트·토스 정산·GA 와 대조된다. 10시로는 불가능했다.
-- 남은 "밤 세션 갈림"은 아래 §2 세션 시작 귀속이 직접·정확하게 해결한다.
--
-- 변경 요약
--   §1 날짜식 4함수 7곳: `- interval '10 hours'` 제거 (trend 1 · visitor_mix 2 · routes 2 · auth 2)
--   §2 admin_traffic_visitor_mix: 방문일 귀속을 페이지뷰 → **세션 시작**으로 교체
--   entry·bot·normalize_entry 는 날짜식이 없어 변경 없음.
--
-- ⚠️ `at time zone 'UTC'` 는 **유지**한다. 빼면 timestamptz::date 캐스트가 세션 TimeZone 에
--    좌우된다. JS 쪽 kstDate(lib/admin-time.ts)는 .toISOString() = 항상 UTC 기준이므로 여기서
--    UTC 를 못박아 맞춘다. 이 등가성은 lib/admin-time.test.ts 가 지킨다.
-- ⚠️ 본문 컬럼은 전부 별칭 수식한다(lg.bucket 등). RETURNS TABLE 의 bucket·uv 가 OUT 파라미터로
--    본문 스코프에 들어와 CTE 컬럼과 이름이 겹치기 때문 — 수식하면 해석이 결정적이다.
-- ⚠️ 부수 효과: 일별 숫자가 움직인다. specs/2026-07-29-admin-expected-values.md(d3)·
--    specs/2026-07-30-d4-snapshot-findings.md(d4) 의 일별 표는 **10시 기준**이라 재실행하면
--    다른 값이 나온다. 두 문서 상단에 기준을 명시해 뒀다.

-- ── 1. 일별 UV/PV 추세 (KST 자정) ──
-- 🔴 이 UV 는 **페이지뷰 귀속**이다 — PV 가 정의상 페이지뷰 수라 짝을 맞춘다.
--    아래 visitor_mix 의 UV(세션 시작 귀속)와 하루 1명 수준으로 다를 수 있다(의도된 것).
CREATE OR REPLACE FUNCTION admin_traffic_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, uv BIGINT, pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ((created_at AT TIME ZONE 'UTC' + interval '9 hours')::date),
         count(DISTINCT anon_id),
         count(*)
  FROM page_views
  WHERE created_at >= p_since
    AND is_bot = false
    AND (user_id IS NULL OR user_id <> ALL(p_exclude))
  GROUP BY 1 ORDER BY 1;
$$;

-- ── 2. 방문자 구성 (신규 / 연속 / 복귀) — 세션 시작 귀속 ──
--
-- 🆕 방문일 = 그 방문자의 **세션 첫 이벤트** 시각의 KST 자정 날짜.
--    같은 anon_id 안에서 **30분 이상 공백이면 새 세션**으로 끊는다.
--
-- SESSION_GAP = 30분 (튜너블). 근거 — prod 실측 n=325: 세션 평균 4.2분 · p90 13.1분.
--   30분은 p90 보다 넉넉히 커서 진짜 세션을 쪼개지 않고, 30분 이상 벌어진 방문은 실제로 별개다.
--   ⚠️ "평균 4.2분"을 체류시간으로 읽지 말 것 — 대화 중엔 라우트 이동이 없어 PV 가 안 찍힌다(SPA).
--   ⚠️ 이 값을 바꾸려면 scripts/cycle-snapshot-a-retention.sql 의 3기준 대조표를 다시 뜰 것.
--
-- 🔴 prev 계산은 조회창에 의존해선 안 된다. 창 안에서만 lag 하면 ①창 밖에 첫 방문이 있던
--    방문자가 신규로 오분류되고 ②가장 오래된 버킷의 연속/복귀 구분이 전부 틀린다.
--    그래서 lag 를 전체 테이블에 돌린 뒤 창 필터를 나중에 건다.
-- ⚠️ 봇·어드민 제외를 여기서도 동일 적용해야 한다. 안 걸면 봇으로 오분류된 하루나 운영자로
--    돌아본 날이 그 anon_id 의 첫 방문이 되어 실제 사람의 첫 방문이 영원히 "복귀"로 잡힌다.
-- 🔴 불변식: 신규 + 연속 + 복귀 = UV. visits 가 (anon_id, bucket) 로 DISTINCT 하므로 연속 행의
--    bucket 은 강증가 → prev 는 항상 bucket 미만이고, 세 filter 는 배타적·완전하다.
--    분자·분모를 **같은 CTE(lagged)에서** 뽑기 때문에 세션 귀속으로 바꿔도 합이 어긋나지 않는다.
--    (플랜 A Step 3 이 실제로 이 불변식으로 버그를 잡았다. 2026-07-31 실측: 12개 버킷 전부 성립)
CREATE OR REPLACE FUNCTION admin_traffic_visitor_mix(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, uv BIGINT, new_uv BIGINT, streak_uv BIGINT, back_uv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    -- 세션 경계 판정: 직전 이벤트가 없거나 30분 이상 벌어졌으면 새 세션 시작(1)
    SELECT v.anon_id AS anon_id,
           v.created_at AS created_at,
           CASE WHEN lag(v.created_at) OVER w IS NULL
                  OR v.created_at - lag(v.created_at) OVER w > interval '30 minutes'
                THEN 1 ELSE 0 END AS newsess
    FROM page_views v
    WHERE v.anon_id IS NOT NULL
      AND v.is_bot = false
      AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
    WINDOW w AS (PARTITION BY v.anon_id ORDER BY v.created_at)
  ), sess AS (
    -- 누적합으로 세션 번호 부여
    SELECT e.anon_id AS anon_id,
           e.created_at AS created_at,
           sum(e.newsess) OVER (PARTITION BY e.anon_id ORDER BY e.created_at) AS sno
    FROM ev e
  ), visits AS (
    -- 세션당 1행(첫 이벤트) → 그 날짜가 방문일. 같은 날 여러 세션은 DISTINCT 로 접힌다.
    SELECT DISTINCT s.anon_id AS anon_id,
           ((min(s.created_at) AT TIME ZONE 'UTC' + interval '9 hours')::date) AS bucket
    FROM sess s
    GROUP BY s.anon_id, s.sno
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
  WHERE lg.bucket >= ((p_since AT TIME ZONE 'UTC' + interval '9 hours')::date)
  GROUP BY lg.bucket ORDER BY lg.bucket;
$$;

-- ── 3. 라우트별 UV·PV + 오늘 열 (KST 자정) ──
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
         count(DISTINCT v.anon_id) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date) = p_today),
         count(*) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date) = p_today)
  FROM page_views v
  WHERE v.created_at >= p_since
    AND v.is_bot = false
    AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  GROUP BY v.path
  ORDER BY count(*) DESC, count(DISTINCT v.anon_id) DESC
  LIMIT p_limit;
$$;

-- ── 4. 로그인 전/후 (KST 자정) ──
-- 빈 데이터에서도 두 행을 항상 반환한다(화면 표가 사라지지 않게) → segments 를 좌변에 두고 LEFT JOIN.
-- 주의: 같은 anon_id 가 가입 순간 양쪽에 나타나므로 두 UV 합은 전체 UV 보다 클 수 있다(정상).
-- count(v.id) 여야 한다 — count(*) 면 매칭 0인 세그먼트가 0 이 아니라 1 로 나온다.
CREATE OR REPLACE FUNCTION admin_traffic_auth(p_since TIMESTAMPTZ, p_exclude UUID[], p_today DATE)
RETURNS TABLE (segment TEXT, uv BIGINT, pv BIGINT, today_uv BIGINT, today_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.segment,
         count(DISTINCT v.anon_id),
         count(v.id),
         count(DISTINCT v.anon_id) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date) = p_today),
         count(v.id) FILTER (WHERE ((v.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date) = p_today)
  FROM (VALUES ('guest'), ('member')) AS s(segment)
  LEFT JOIN page_views v
    ON (CASE WHEN v.user_id IS NULL THEN 'guest' ELSE 'member' END) = s.segment
   AND v.created_at >= p_since
   AND v.is_bot = false
   AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  GROUP BY s.segment
  ORDER BY s.segment;
$$;

-- ── 권한 재확인: service_role 전용 (게이트는 라우트의 requireAdmin 이 담당) ──
-- CREATE OR REPLACE 는 기존 ACL 을 보존하므로 20260729000000·010000 의 회수가 유지되지만,
-- AGENTS.md 규칙대로 PUBLIC·anon·authenticated 셋 다 명시 회수한다(이중 방어 — 기본값은 언제든
-- 플랫폼 쪽에서 되돌아갈 수 있다). 시그니처를 전부 명시한다 — 이름만 쓰면 오버로드가 생겼을 때
-- 조용히 대상이 어긋난다.
REVOKE EXECUTE ON FUNCTION admin_traffic_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_visitor_mix(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_routes(TIMESTAMPTZ, UUID[], DATE, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_auth(TIMESTAMPTZ, UUID[], DATE) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_traffic_trend(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_visitor_mix(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_routes(TIMESTAMPTZ, UUID[], DATE, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_auth(TIMESTAMPTZ, UUID[], DATE) TO service_role;
