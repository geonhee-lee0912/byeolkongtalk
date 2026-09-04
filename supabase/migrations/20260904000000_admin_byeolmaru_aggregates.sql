-- 별마루 어드민 집계 RPC (2026-09-04) — 트래픽이 흐르기 전 기준선 계측.
-- 스펙: docs/superpowers/specs/2026-08-31-별마루-리텐션허브-design.md §8
-- 플랜: docs/superpowers/plans/2026-09-04-별마루-4-계측.md Task 2
--
-- page_views(path='/byeolmaru') 로 진입(PV/UV), ui_events 4종
-- (byeolmaru_day_selected · byeolmaru_slot_clicked · byeolmaru_no_profile ·
-- byeolmaru_need_login) 으로 인터랙션·퍼널 이탈을 잰다. 새 테이블 없음 — 둘 다 기존 비콘.
--
-- UV = distinct coalesce(user_id::text, anon_id) — 로그인 유저가 기기를 바꿔 anon_id 가
-- 여러 개 생겨도 user_id 로 합쳐서 센다(byeoljari/saju_mbti 관행의 count(DISTINCT anon_id)
-- 보다 한 단계 정확한 버전 — 로그인 유저가 있는 화면이라 이 버전을 쓴다).
--
-- 🔴 D1~D7 재방문(admin_byeolmaru_retention) 은 로그인 유저만 코호트로 잡는다.
--    anon_id 는 쿠키 삭제·기기 변경에 취약해 코호트 자체가 오염된다(같은 사람이 여러 anon 으로
--    쪼개지거나 다른 사람이 같은 anon 을 물려받는다) — user_id 는 그 문제가 없다.
--    "비로그인 배제"는 user_id IS NOT NULL 로 명시한다(3값 논리 사고의 부작용이 아니라 의도).
--
-- 어드민 제외(p_exclude): (col IS NULL OR col <> ALL(p_exclude)). NULL 은 3값 논리라
--    NOT (col = ANY(...)) 단독으로 쓰면 그 행 자체가 WHERE 에서 버려진다(과거 UV 53% 유실 사고,
--    AGENTS.md). retention 은 애초에 user_id IS NOT NULL 만 다루므로 <> ALL(p_exclude) 단독으로
--    안전하다(더할 IS NULL 분기가 없다).
--
-- 날짜식은 전부 (created_at AT TIME ZONE 'UTC' + interval '9 hours')::date — 'UTC' 를 빼면
--    캐스트가 세션 TimeZone 에 좌우된다(lib/admin-time.ts kstDate 와 등가, AGENTS.md).
--
-- ⚠️ retention 은 플랜 초안(SQL 뼈대)에 "미성숙 오프셋" 가드를 추가했다 — 코호트일+N일 이
--    아직 오늘을 안 지났으면 그 (cohort_date, offset_day) 조합 자체를 뺀다. 안 걸러내면 막
--    생긴 코호트의 D7 이 "시간이 안 지나서" 전부 0명으로 찍혀 이탈과 관측 불가가 구분되지
--    않는다 — admin_saju_mbti_retention(20260829040000) 의 "eligible = 관측창 성숙" 과 같은 발상.
--
-- RETURNS TABLE OUT 파라미터명(cohort_date 등)과 겹치는 이름을 본문에서 쓰지 않는다
--    (admin_byeoljari_aggregates 가 남긴 "본문 컬럼 별칭 수식" 경고 — uid/visit_date/cohort_d/off_n
--    로 전부 다른 이름을 써 스코프 충돌 여지를 없앴다).

-- ── 1. 누적 요약 (스칼라 1행) ──
CREATE OR REPLACE FUNCTION admin_byeolmaru_summary(p_exclude UUID[])
RETURNS TABLE (
  pv BIGINT, uv BIGINT,
  day_selected_events BIGINT, day_selected_actors BIGINT,
  slot_clicked_events BIGINT, slot_clicked_actors BIGINT,
  no_profile_events BIGINT, no_profile_actors BIGINT,
  need_login_events BIGINT, need_login_actors BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM page_views pv
       WHERE pv.path = '/byeolmaru' AND pv.is_bot = false
         AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(DISTINCT coalesce(pv.user_id::text, pv.anon_id)) FROM page_views pv
       WHERE pv.path = '/byeolmaru' AND pv.is_bot = false
         AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'byeolmaru_day_selected'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(DISTINCT coalesce(e.user_id::text, e.anon_id)) FROM ui_events e
       WHERE e.event = 'byeolmaru_day_selected'
         AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'byeolmaru_slot_clicked'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(DISTINCT coalesce(e.user_id::text, e.anon_id)) FROM ui_events e
       WHERE e.event = 'byeolmaru_slot_clicked'
         AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'byeolmaru_no_profile'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(DISTINCT coalesce(e.user_id::text, e.anon_id)) FROM ui_events e
       WHERE e.event = 'byeolmaru_no_profile'
         AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'byeolmaru_need_login'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(DISTINCT coalesce(e.user_id::text, e.anon_id)) FROM ui_events e
       WHERE e.event = 'byeolmaru_need_login'
         AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT;
$$;

-- ── 2. 일별 추세 (bucket, kind, cnt) — long 포맷, 앱에서 피벗 ──
CREATE OR REPLACE FUNCTION admin_byeolmaru_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, kind TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'pv', count(*)
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/byeolmaru' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'uv',
         count(DISTINCT coalesce(pv.user_id::text, pv.anon_id))
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/byeolmaru' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (e.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'day_selected', count(*)
    FROM ui_events e
    WHERE e.created_at >= p_since AND e.event = 'byeolmaru_day_selected'
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (e.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'slot_clicked', count(*)
    FROM ui_events e
    WHERE e.created_at >= p_since AND e.event = 'byeolmaru_slot_clicked'
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 1
  ORDER BY 1;
$$;

-- ── 3. D1~D7 재방문 코호트 (long 포맷) — 이 계획의 핵심 ──
-- 로그인 유저만(사유는 파일 상단). 미성숙 오프셋(코호트일+N일 > 오늘)은 행 자체를 뺀다.
CREATE OR REPLACE FUNCTION admin_byeolmaru_retention(p_exclude UUID[])
RETURNS TABLE (cohort_date DATE, cohort_users BIGINT, offset_day INT, returned_users BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v AS (
    SELECT DISTINCT pv.user_id AS uid,
           (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date AS visit_date
    FROM page_views pv
    WHERE pv.path = '/byeolmaru'
      AND pv.is_bot = false
      AND pv.user_id IS NOT NULL
      AND pv.user_id <> ALL(p_exclude)
  ),
  first_seen AS (
    SELECT uid, min(visit_date) AS cohort_d FROM v GROUP BY 1
  )
  SELECT fs.cohort_d,
         count(DISTINCT fs.uid),
         o.off_n,
         count(DISTINCT v2.uid)
  FROM first_seen fs
  CROSS JOIN generate_series(1, 7) AS o(off_n)
  LEFT JOIN v v2 ON v2.uid = fs.uid AND v2.visit_date = fs.cohort_d + o.off_n
  WHERE fs.cohort_d + o.off_n <= (now() AT TIME ZONE 'UTC' + interval '9 hours')::date
  GROUP BY fs.cohort_d, o.off_n
  ORDER BY fs.cohort_d DESC, o.off_n;
$$;

-- ── 권한: service_role 전용 (AGENTS.md — PUBLIC·anon·authenticated 셋 다 명시 회수) ──
REVOKE EXECUTE ON FUNCTION admin_byeolmaru_summary(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeolmaru_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeolmaru_retention(UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_byeolmaru_summary(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeolmaru_trend(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeolmaru_retention(UUID[]) TO service_role;
