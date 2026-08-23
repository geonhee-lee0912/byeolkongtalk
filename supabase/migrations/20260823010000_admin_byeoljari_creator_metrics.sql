-- 생성자(creator) 중심 지표 — 스펙 §5① 생성자 UTM 분포 · §5④ 생성→첫결제 시간 (2026-08-23)
-- admin_byeoljari_summary 는 반환타입 변경(컬럼 추가)이 CREATE OR REPLACE 로 불가라 별도 함수로 추가한다.
-- creator = star_maps.owner_user_id (로그인 생성자). 익명 생성 맵(owner NULL)은 user 귀속이 없어 제외.
-- ⚠️ 날짜 산술은 KST 무관(경과 시간 diff 라 타임존 불변). utm 분포는 NULL(오가닉/직접)도 버킷.

-- ① 생성자 UTM 분포 (utm_source, cnt) — 여러 행
CREATE OR REPLACE FUNCTION admin_byeoljari_creator_utm(p_exclude UUID[])
RETURNS TABLE (utm_source TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(ua.utm_source, '(직접/오가닉)'), count(*)::BIGINT
  FROM (
    SELECT DISTINCT sm.owner_user_id AS user_id
    FROM star_maps sm
    WHERE sm.owner_user_id IS NOT NULL AND sm.owner_user_id <> ALL(p_exclude)
  ) c
  LEFT JOIN user_acquisition ua ON ua.user_id = c.user_id
  GROUP BY coalesce(ua.utm_source, '(직접/오가닉)')
  ORDER BY count(*) DESC;
$$;

-- ② 생성→첫결제 중앙 시간(시간 단위) + 표본 수 — 스칼라 1행
-- creator 별 (첫 별자리 생성시각 → 그 이후 첫 완료결제 시각) 경과의 중앙값.
CREATE OR REPLACE FUNCTION admin_byeoljari_conversion(p_exclude UUID[])
RETURNS TABLE (create_to_pay_median_hours DOUBLE PRECISION, sample_n BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH creator_map AS (
    SELECT sm.owner_user_id AS user_id, min(sm.created_at) AS map_at
    FROM star_maps sm
    WHERE sm.owner_user_id IS NOT NULL AND sm.owner_user_id <> ALL(p_exclude)
    GROUP BY sm.owner_user_id
  ), first_pay AS (
    SELECT cm.user_id AS user_id, cm.map_at AS map_at, min(p.created_at) AS pay_at
    FROM creator_map cm
    JOIN payments p ON p.user_id = cm.user_id
    WHERE p.status = 'completed' AND p.created_at >= cm.map_at
    GROUP BY cm.user_id, cm.map_at
  )
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (fp.pay_at - fp.map_at)) / 3600.0),
    count(*)::BIGINT
  FROM first_pay fp;
$$;

REVOKE EXECUTE ON FUNCTION admin_byeoljari_creator_utm(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeoljari_conversion(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_byeoljari_creator_utm(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeoljari_conversion(UUID[]) TO service_role;
