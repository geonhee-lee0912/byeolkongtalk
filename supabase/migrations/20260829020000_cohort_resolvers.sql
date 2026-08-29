-- 코호트 resolver (2026-08-29) — 무료 상품이 "가입 상태로 데려온/닿은" user_id 목록.
-- RETURNS TABLE(user_id UUID) — 앱은 data.map(r=>r.user_id) 로 UUID[] 구성.
-- byeoljari: summary(20260823000000) 의 코호트(utm ∪ 참여자 브리지)와 동일 집합.
-- mbti: utm(saju_mbti) ∪ 로그인 완료자 ∪ anon 브리지(완료 anon→가입, 같은 기기 = 하한).

CREATE OR REPLACE FUNCTION admin_byeoljari_cohort_users(p_exclude UUID[])
RETURNS TABLE (user_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH member_anons AS (
    SELECT DISTINCT m.member_anon_id AS anon_id
    FROM star_map_members m
    JOIN star_maps sm ON sm.id = m.map_id
    WHERE m.is_host = false AND m.member_anon_id IS NOT NULL
      AND m.member_anon_id <> sm.creator_anon_id
  ), member_users AS (
    SELECT DISTINCT pv.user_id AS uid
    FROM page_views pv JOIN member_anons ma ON ma.anon_id = pv.anon_id
    WHERE pv.user_id IS NOT NULL AND pv.user_id <> ALL(p_exclude) AND pv.is_bot = false
  ), utm_users AS (
    SELECT DISTINCT ua.user_id AS uid
    FROM user_acquisition ua
    WHERE ua.utm_source = 'byeoljari' AND ua.user_id <> ALL(p_exclude)
  )
  SELECT uid FROM member_users UNION SELECT uid FROM utm_users;
$$;

CREATE OR REPLACE FUNCTION admin_saju_mbti_cohort_users(p_exclude UUID[])
RETURNS TABLE (user_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH utm_users AS (
    SELECT DISTINCT ua.user_id AS uid
    FROM user_acquisition ua
    WHERE ua.utm_source = 'saju_mbti' AND ua.user_id <> ALL(p_exclude)
  ), completed_logged_in AS (
    SELECT DISTINCT e.user_id AS uid
    FROM ui_events e
    WHERE e.event = 'saju_mbti_completed' AND e.user_id IS NOT NULL
      AND e.user_id <> ALL(p_exclude)
  ), completed_anons AS (
    SELECT DISTINCT e.anon_id AS anon_id
    FROM ui_events e
    WHERE e.event = 'saju_mbti_completed' AND e.anon_id IS NOT NULL
  ), anon_bridge AS (
    SELECT DISTINCT pv.user_id AS uid
    FROM page_views pv JOIN completed_anons ca ON ca.anon_id = pv.anon_id
    WHERE pv.user_id IS NOT NULL AND pv.user_id <> ALL(p_exclude) AND pv.is_bot = false
  )
  SELECT uid FROM utm_users
  UNION SELECT uid FROM completed_logged_in
  UNION SELECT uid FROM anon_bridge;
$$;

REVOKE EXECUTE ON FUNCTION admin_byeoljari_cohort_users(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_saju_mbti_cohort_users(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_byeoljari_cohort_users(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_saju_mbti_cohort_users(UUID[]) TO service_role;
