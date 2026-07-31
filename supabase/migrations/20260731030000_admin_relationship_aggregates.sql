-- 어드민 연애 상담(우리 사이) 집계 RPC (2026-07-31) — 플랜 D
--
-- 왜: /admin/relationship 과 /admin/relationship-readings 는 남은 케이스 중 모양이 제일 나쁘다.
-- 두 화면 쿼리 대부분이 `.limit()` **조차 없어** Supabase `Max rows`(서버 강제 상한, 기본 1000)에
-- 그대로 올라앉아 있다. PostgREST 는 200 + Content-Range 로 응답하고 supabase-js 는 이를 에러로
-- 승격하지 않아 **조용히 잘린다**(2026-07-28 사고: /admin/traffic UV 53% 유실 ·
-- /admin/paywall 상담 완료율 21% 표시, 실제 63.7%).
-- 2026-07-31 실측은 작다(relationships 30 · relationship_passes 5 · 스레드 messages 154) —
-- 즉 **지금 터진 불이 아니라 구조 교정**이다. 작은 숫자를 이유로 지름길을 타지 않는다.
--
-- ⚠️ 날짜 버킷은 KST 자정: ((created_at AT TIME ZONE 'UTC' + interval '9 hours')::date).
--    `AT TIME ZONE 'UTC'` 를 빼면 timestamptz::date 캐스트가 **세션 TimeZone 에 좌우된다.**
-- ⚠️ 본문 컬럼은 전부 별칭 수식한다 — RETURNS TABLE 의 OUT 파라미터가 본문 스코프에 들어와
--    CTE 컬럼과 이름이 겹친다(id·status·kind·created_at 처럼 흔한 이름이 많다).
-- ⚠️ "지금" 은 SQL 의 now() 가 아니라 **앱이 넘긴 p_now** 를 쓴다 — 현행 JS 가
--    `new Date().toISOString()` 하나로 활성 패스·활성 스레드를 판정하므로 시계를 하나로 유지한다.
--
-- 이 파일이 만지는 컬럼의 NULL 가능성 (20260718000000_relationship_core.sql · 20260604000000_stars.sql
-- · 20260605000000_saju_core.sql 에서 확인. 추정 아님):
--   relationships:        user_id/label/status/created_at NOT NULL · thread_reading_id·last_visited_at NULLABLE
--   relationship_passes:  user_id/relationship_id/kind/stars_spent/expires_at/created_at 전부 NOT NULL
--   star_transactions:    user_id/type/amount/source NOT NULL · reading_id NULLABLE(ON DELETE SET NULL)
--   readings:             user_id/stars_spent NOT NULL · relationship_id·skill_key NULLABLE
--   messages:             reading_id/role/created_at NOT NULL · skill_key NULLABLE

-- ── 1. 연애 지표 요약 (등록/스레드 카드 + 패스 카드) ──
-- 반환은 항상 1행 = cap 개념 소멸.
-- 현행 app/admin/relationship/page.tsx 재현:
--   활성 스레드 = last_visited_at 이 있고 7일 전보다 최근 (JS 는 `r.last_visited_at && …` 로
--                 NULL 을 먼저 걸렀다. SQL 도 IS NOT NULL 을 명시한다 — NULL 비교는 false 가
--                 아니라 NULL 이고, count(*) FILTER 는 TRUE 만 센다. 결과는 같지만 명시가 규율)
--   활성 패스   = expires_at > p_now (JS 는 ISO 문자열 비교였다 — 둘 다 UTC 정규화 ISO 라
--                 사전순=시간순이 성립했다. 여기선 timestamptz 비교라 마이크로초 동률만 다르다)
--   갱신(재구매) = 패스를 2건 이상 산 유저 수 · 패스 구매자 = 패스를 산 distinct 유저 수
--   연장 횟수   = star_transactions.source='rel_extend' 건수 (현행도 count exact/head 라 cap 무관.
--                 라운드트립을 줄이려 같은 카드의 스칼라라 여기로 합쳤다)
CREATE OR REPLACE FUNCTION admin_relationship_summary(
  p_exclude UUID[], p_now TIMESTAMPTZ, p_week_ago TIMESTAMPTZ
)
RETURNS TABLE (
  total_rels BIGINT, active_threads BIGINT,
  active_passes BIGINT, pass_buyers BIGINT, renewers BIGINT, pass_revenue BIGINT,
  extend_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH rel AS (
    SELECT r.last_visited_at AS last_visited_at
    FROM relationships r
    WHERE r.user_id <> ALL(p_exclude)
  ), pass AS (
    SELECT p.user_id AS user_id, p.expires_at AS expires_at, p.stars_spent AS stars_spent
    FROM relationship_passes p
    WHERE p.user_id <> ALL(p_exclude)
  ), by_user AS (
    SELECT pu.user_id AS user_id, count(*) AS n FROM pass pu GROUP BY pu.user_id
  )
  SELECT
    (SELECT count(*) FROM rel)::BIGINT,
    (SELECT count(*) FROM rel r2
      WHERE r2.last_visited_at IS NOT NULL AND r2.last_visited_at > p_week_ago)::BIGINT,
    (SELECT count(*) FROM pass p2 WHERE p2.expires_at > p_now)::BIGINT,
    (SELECT count(*) FROM by_user)::BIGINT,
    (SELECT count(*) FROM by_user b WHERE b.n >= 2)::BIGINT,
    (SELECT coalesce(sum(p3.stars_spent), 0) FROM pass p3)::BIGINT,
    (SELECT count(*) FROM star_transactions t
      WHERE t.source = 'rel_extend' AND t.user_id <> ALL(p_exclude))::BIGINT;
$$;

-- ── 2. 분포 3종 (관계 상태 · 패스 종류 · 스킬 호출) ──
-- 행 모양이 같은 (key, cnt) 3갈래라 admin_product_breakdown 처럼 kind 로 한 함수에 태운다.
-- 🔴 p_limit 이 **없는** 이유 = 반환 행수가 데이터량이 아니라 값 도메인에 유계라서다:
--   status  ≤ 4 (relationships CHECK: crush/dating/breakup/onesided)
--   kind    ≤ 3 (relationship_passes CHECK: day1/day3/day7)
--   skill   ≤ p_skill_keys 길이 — readings.skill_key 는 VARCHAR(20) 자유값이라 그 자체로는
--           유계가 아니다. 그런데 화면은 어차피 고정 4키만 그린다(그 외 값은 렌더에 안 닿는다).
--           그래서 키 목록의 단일 원천을 앱에 두고 배열로 받아 필터한다(p_fortune_types 와 같은 규칙).
-- ⚠️ 정렬: 현행 JS 는 `for (const r of rels) statusDist[r.status] = …` 라 삽입 순서 = **ORDER BY
--    없는 PostgREST 반환 순서**였다. 즉 상태 라벨 줄("썸 12 · 연애중 5 …")의 순서는 원래
--    비결정적이다(힙 순서는 UPDATE 로 바뀐다). 여기서 건수 내림차순 → 키 오름차순으로 못박는다.
CREATE OR REPLACE FUNCTION admin_relationship_dist(p_exclude UUID[], p_skill_keys TEXT[])
RETURNS TABLE (kind TEXT, key TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'status'::TEXT, r.status::TEXT, count(*)::BIGINT
  FROM relationships r
  WHERE r.user_id <> ALL(p_exclude)
  GROUP BY r.status
  UNION ALL
  SELECT 'pass_kind'::TEXT, p.kind::TEXT, count(*)::BIGINT
  FROM relationship_passes p
  WHERE p.user_id <> ALL(p_exclude)
  GROUP BY p.kind
  UNION ALL
  SELECT 'skill'::TEXT, rd.skill_key::TEXT, count(*)::BIGINT
  FROM readings rd
  WHERE rd.skill_key IS NOT NULL
    AND rd.skill_key = ANY(p_skill_keys)
    AND rd.user_id <> ALL(p_exclude)
  GROUP BY rd.skill_key
  ORDER BY 1, 3 DESC, 2;
$$;

-- ── 3. 대화 흐름 (방문 세션 · 소프트캡) ──
-- lib/analytics/aggregate.ts 의 buildRelationshipFlow 를 그대로 옮긴 것. 규칙:
--   · 모집단 = 어드민 제외 관계의 thread_reading_id 에 달린 messages 중 **role='user'** 만.
--     skill_key 는 **거르지 않는다**(현행도 안 거른다 — 스킬 턴도 방문·턴에 포함).
--   · 방문(세션) = 스레드별 시간순으로 훑어 직전 발화와 **6시간 초과** 갭이면 새 방문.
--     첫 발화는 prev=-Infinity 라 항상 새 방문 → SQL 에선 lag() IS NULL 이 그 자리다.
--   · 소프트캡 도달 = (스레드, KST 날짜) 조합 중 user 턴 20회 이상인 칸의 수.
--   · 방문당 평균 턴은 **여기서 계산하지 않는다** — 앱이 Math.round((turns/visits)*10)/10 로
--     계산한다. numeric round 와 JS 부동소수 round 는 .x5 정확 동률에서 갈릴 수 있어(41/20=2.05)
--     화면 숫자를 비트 단위로 보존하려면 나눗셈을 JS 에 남기는 쪽이 안전하다.
-- ⚠️ 6h·20 은 aggregate.ts 의 SESSION_GAP_MS·SOFTCAP_TURNS 리터럴과 짝이다(그쪽도 비공개 리터럴).
--    제품 캡 상수는 lib/relationship/types.ts DAILY_TURN_CAP=20 로 따로 있다 — 셋이 어긋나면
--    이 지표 정의가 조용히 바뀐다. 값을 바꿀 땐 셋 다 볼 것.
-- ⚠️ JS 는 Date.getTime() 이라 ms 정밀도, Postgres 는 µs 다. 갭이 정확히 6h + 몇 µs 인
--    경계에서만 판정이 갈린다(현실 표본에선 발생 확률 0에 가깝다).
CREATE OR REPLACE FUNCTION admin_relationship_flow(p_exclude UUID[])
RETURNS TABLE (visits BIGINT, total_turns BIGINT, softcap_days BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH turn AS (
    SELECT m.reading_id AS reading_id, m.created_at AS created_at
    FROM messages m
    WHERE m.role = 'user'
      -- 서브쿼리에서 NULL 을 먼저 턴다. IN 은 NOT IN 만큼 위험하진 않지만 3값 논리 습관을 지킨다.
      AND m.reading_id IN (
        SELECT r.thread_reading_id FROM relationships r
        WHERE r.thread_reading_id IS NOT NULL AND r.user_id <> ALL(p_exclude)
      )
  ), gapped AS (
    SELECT t.reading_id AS reading_id, t.created_at AS created_at,
           lag(t.created_at) OVER (PARTITION BY t.reading_id ORDER BY t.created_at) AS prev_at
    FROM turn t
  ), per_day AS (
    SELECT t.reading_id AS reading_id,
           ((t.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date) AS kst_day,
           count(*) AS turns
    FROM turn t GROUP BY 1, 2
  )
  SELECT
    (SELECT count(*) FROM gapped g
      WHERE g.prev_at IS NULL OR g.created_at - g.prev_at > interval '6 hours')::BIGINT,
    (SELECT count(*) FROM turn)::BIGINT,
    (SELECT count(*) FROM per_day pd WHERE pd.turns >= 20)::BIGINT;
$$;

-- ── 4. 스레드(관계) 단위 관리 목록 ──
-- 현행 app/admin/relationship-readings/page.tsx 의 6쿼리 + 앱 조인을 통째로 대체한다.
-- ⚠️ 이 화면은 **어드민을 제외하지 않는다** — 운영자 행도 보여주고 배지만 단다(isAdminUserId).
--    그래서 p_exclude 파라미터가 없다. 실수로 붙이지 말 것.
-- 🔴 p_limit 필수 — 유일하게 반환 행수가 데이터(관계 수)에 비례한다. RPC 결과도 PostgREST 를
--    지나므로 상한을 안 박으면 `Max rows` cap 이 그대로 물린다. 상한 도달은 앱이 경고로 드러낸다.
--    기본 2000 의 근거: 2026-07-31 실측 30행, 관계는 user 당 1개(UNIQUE idx_relationships_user_one)
--    이고 등록 속도는 하루 2건 남짓 → 수년치 여유. 근본 해결은 페이지네이션이다(2000행을 한 표에
--    쏟는 UI 는 이미 무리) — 상한에 닿기 전에 그쪽으로 갈 것.
-- total_count 는 LIMIT 전 전체 행수(윈도우 집계)다 — 잘려도 헤더가 실제 규모를 말하게 한다.
--
-- 지출 합산 갈래 4개 (현행 addSpend 재현, 전부 절댓값):
--   ① relationship_passes.stars_spent          → 관계에 직접 귀속
--   ② star_transactions source='rel_extend'    → reading_id = 스레드 본체 reading → 관계로 환산
--   ③ readings.skill_key IS NOT NULL 의 stars_spent → 관계에 직접 귀속 (과거식 스킬 reading)
--   ④ star_transactions source LIKE 'rel_skill_%' AND type='spend' → 스레드 → 관계로 환산
--      (인-스레드 스킬 4종은 readings 행을 안 만들고 트랜잭션만 남긴다. 환불은 charge 라 제외.)
--   스킬 건수·스킬 지출 = ③+④ · 누적 지출 = ①+②+③+④ (현행과 동일).
-- ⚠️ ③과 ④는 reading_id 공간이 겹치지 않는다(③은 스킬 고유 reading, ④는 스레드 본체) → 중복 없음.
-- ⚠️ LIKE 'rel_skill_%' 의 `_` 는 LIKE 와일드카드다. 현행 PostgREST `.like("source","rel_skill_%")`
--    도 이스케이프 없이 같은 패턴을 보내므로 **의도적으로 그대로 둔다**(고치면 현행과 대조가 깨진다).
--    실제 source 어휘가 rel_skill_verdict/compat/checkin/deep_feelings 뿐이라 차이는 없다.
-- ⚠️ 조인 카디널리티 가정: thread_reading_id 는 관계당 유일하고 **관계들 사이에서도 중복되지 않는다**
--    (DB 제약은 없다 — 앱이 스레드 reading 을 관계마다 새로 만든다). 중복이 있으면 ②④가 두 관계에
--    이중 계상된다(현행 JS 는 Map 이라 한쪽만 먹었다). 검증 SQL 은 이 파일 하단 주석 참고.
CREATE OR REPLACE FUNCTION admin_relationship_threads(p_now TIMESTAMPTZ, p_limit INT DEFAULT 2000)
RETURNS TABLE (
  id UUID, user_id UUID, label TEXT, status TEXT,
  msg_count BIGINT, skill_count BIGINT, skill_spend BIGINT,
  active_pass_kind TEXT, active_pass_expires_at TIMESTAMPTZ,
  total_spend BIGINT, last_visited_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH rel AS (
    SELECT r.id AS id, r.user_id AS user_id, r.label AS label, r.status AS status,
           r.thread_reading_id AS thread_reading_id,
           r.last_visited_at AS last_visited_at, r.created_at AS created_at
    FROM relationships r
  ), msg AS (
    -- 스레드 본체 reading 의 메시지 수 — role 무관(현행도 전량 카운트).
    SELECT m.reading_id AS reading_id, count(*) AS n
    FROM messages m
    WHERE m.reading_id IN (
      SELECT rl.thread_reading_id FROM rel rl WHERE rl.thread_reading_id IS NOT NULL
    )
    GROUP BY m.reading_id
  ), pass_spend AS (
    SELECT p.relationship_id AS relationship_id, sum(abs(p.stars_spent))::BIGINT AS spend
    FROM relationship_passes p GROUP BY p.relationship_id
  ), active_pass AS (
    -- 만료 전 패스 중 가장 늦게 끝나는 것 하나. 현행은 동률 시 먼저 만난 행이 이겨 비결정적이었다
    -- → id 로 tie-break 를 못박는다(µs 해상도라 동률 자체가 사실상 없다).
    SELECT DISTINCT ON (p.relationship_id)
           p.relationship_id AS relationship_id, p.kind::TEXT AS kind, p.expires_at AS expires_at
    FROM relationship_passes p
    WHERE p.expires_at > p_now
    ORDER BY p.relationship_id, p.expires_at DESC, p.id DESC
  ), extend_spend AS (
    SELECT rl.id AS relationship_id, sum(abs(t.amount))::BIGINT AS spend
    FROM star_transactions t
    JOIN rel rl ON rl.thread_reading_id = t.reading_id
    WHERE t.source = 'rel_extend' AND t.reading_id IS NOT NULL
    GROUP BY rl.id
  ), skill_reading AS (
    SELECT rd.relationship_id AS relationship_id,
           count(*) AS n,
           sum(abs(coalesce(rd.stars_spent, 0)))::BIGINT AS spend
    FROM readings rd
    WHERE rd.skill_key IS NOT NULL AND rd.relationship_id IS NOT NULL
    GROUP BY rd.relationship_id
  ), skill_tx AS (
    SELECT rl.id AS relationship_id,
           count(*) AS n,
           sum(abs(t.amount))::BIGINT AS spend
    FROM star_transactions t
    JOIN rel rl ON rl.thread_reading_id = t.reading_id
    WHERE t.source LIKE 'rel_skill_%' AND t.type = 'spend' AND t.reading_id IS NOT NULL
    GROUP BY rl.id
  )
  SELECT rl.id,
         rl.user_id,
         rl.label::TEXT,
         rl.status::TEXT,
         coalesce(m.n, 0)::BIGINT,
         (coalesce(sr.n, 0) + coalesce(st.n, 0))::BIGINT,
         (coalesce(sr.spend, 0) + coalesce(st.spend, 0))::BIGINT,
         ap.kind,
         ap.expires_at,
         (coalesce(ps.spend, 0) + coalesce(es.spend, 0)
            + coalesce(sr.spend, 0) + coalesce(st.spend, 0))::BIGINT,
         rl.last_visited_at,
         rl.created_at,
         (count(*) OVER ())::BIGINT
  FROM rel rl
  LEFT JOIN msg m ON m.reading_id = rl.thread_reading_id
  LEFT JOIN pass_spend ps ON ps.relationship_id = rl.id
  LEFT JOIN active_pass ap ON ap.relationship_id = rl.id
  LEFT JOIN extend_spend es ON es.relationship_id = rl.id
  LEFT JOIN skill_reading sr ON sr.relationship_id = rl.id
  LEFT JOIN skill_tx st ON st.relationship_id = rl.id
  -- 현행 .order("created_at", {ascending:false}) 와 같되 동률 tie-break 를 못박는다
  -- (LIMIT 이 붙으면 비결정적 동률이 "어떤 행이 잘리나"를 흔든다).
  ORDER BY rl.created_at DESC, rl.id DESC
  LIMIT p_limit;
$$;

-- 적용 전 확인용(읽기 전용) — 위 카디널리티 가정 검사. 0행이어야 한다:
--   SELECT thread_reading_id, count(*) FROM relationships
--    WHERE thread_reading_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;

-- ── 권한: service_role 전용 (게이트는 middleware + 페이지의 어드민 가드가 담당) ──
-- 🔴 AGENTS.md 규칙 — 새 SECURITY DEFINER RPC 는 PUBLIC·anon·authenticated 셋 다 명시 회수한다.
--    2026-07-29 부터 기본 권한이 닫혀 있어 새 함수는 닫힌 채 태어나지만, 기본값은 플랫폼 쪽에서
--    언제든 되돌아갈 수 있고 이중 방어가 싸다. 시그니처를 전부 명시한다 — 이름만 쓰면 오버로드가
--    생겼을 때 조용히 대상이 어긋난다.
REVOKE EXECUTE ON FUNCTION admin_relationship_summary(UUID[], TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_relationship_dist(UUID[], TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_relationship_flow(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_relationship_threads(TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_relationship_summary(UUID[], TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION admin_relationship_dist(UUID[], TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_relationship_flow(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_relationship_threads(TIMESTAMPTZ, INT) TO service_role;
