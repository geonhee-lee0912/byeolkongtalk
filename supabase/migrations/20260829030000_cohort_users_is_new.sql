-- 코호트 resolver 확장 (2026-08-29) — 신규/기존 분해용 is_new 플래그 추가.
-- is_new = user_acquisition.utm_source = 이 상품 (공유·초대 링크로 신규 획득).
-- 반환 컬럼 추가라 CREATE OR REPLACE 불가 → DROP+CREATE. 기존 페이지는 r.user_id만 읽어 무영향.

DROP FUNCTION IF EXISTS admin_byeoljari_cohort_users(UUID[]);
CREATE OR REPLACE FUNCTION admin_byeoljari_cohort_users(p_exclude UUID[])
RETURNS TABLE (user_id UUID, is_new BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH member_anons AS (
    SELECT DISTINCT m.member_anon_id AS anon_id
    FROM star_map_members m JOIN star_maps sm ON sm.id = m.map_id
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
  ), cohort AS (
    SELECT uid FROM member_users UNION SELECT uid FROM utm_users
  )
  SELECT c.uid,
         EXISTS(SELECT 1 FROM user_acquisition ua WHERE ua.user_id = c.uid AND ua.utm_source = 'byeoljari')
  FROM cohort c;
$$;

DROP FUNCTION IF EXISTS admin_saju_mbti_cohort_users(UUID[]);
CREATE OR REPLACE FUNCTION admin_saju_mbti_cohort_users(p_exclude UUID[])
RETURNS TABLE (user_id UUID, is_new BOOLEAN)
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
  ), cohort AS (
    SELECT uid FROM utm_users UNION SELECT uid FROM completed_logged_in UNION SELECT uid FROM anon_bridge
  )
  SELECT c.uid,
         EXISTS(SELECT 1 FROM user_acquisition ua WHERE ua.user_id = c.uid AND ua.utm_source = 'saju_mbti')
  FROM cohort c;
$$;

REVOKE EXECUTE ON FUNCTION admin_byeoljari_cohort_users(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_saju_mbti_cohort_users(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_byeoljari_cohort_users(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_saju_mbti_cohort_users(UUID[]) TO service_role;
