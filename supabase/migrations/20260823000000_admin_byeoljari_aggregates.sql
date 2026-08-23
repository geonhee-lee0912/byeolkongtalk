-- 별자리(무료 서비스) 어드민 집계 RPC (2026-08-23)
-- 퍼널: 생성 → 초대 → 가입 → 결제. 어트리뷰션 = B.하이브리드
--   · 링크 유입: user_acquisition.utm_source='byeoljari'
--   · 참여자:    star_map_members.member_anon_id ↔ page_views(anon+user 브리지)
--
-- 어드민 제외(p_exclude):
--   page_views/ui_events: (user_id IS NULL OR user_id <> ALL(p_exclude)) + is_bot=false(pv)
--   user_acquisition/payments/users: user_id/id <> ALL(p_exclude)
--   star_maps: (owner_user_id IS NULL OR owner_user_id <> ALL(p_exclude))
--     — 익명 생성 맵(owner NULL)은 어드민 여부를 못 가린다(구조적 한계, 화면 주석).
-- ⚠️ 대리입력 오염: 비호스트 멤버라도 member_anon_id = 그 맵의 creator_anon_id 면
--    creator 가 대신 입력/자기 링크로 join 한 것 → "외부 참여자" 아님 → 브리지에서 제외.
-- ⚠️ 참여자 브리지는 같은 브라우저 로그인만 이어진다(다른 기기 끊김) → 지표는 하한.
-- ⚠️ 날짜식 (created_at AT TIME ZONE 'UTC' + interval '9 hours')::date — 'UTC' 를 빼면
--    캐스트가 세션 TimeZone 에 좌우된다(lib/admin-time.ts kstDate 와 등가).
-- ⚠️ 본문 컬럼 별칭 수식 — RETURNS TABLE OUT 파라미터가 본문 스코프에 겹친다.

-- ── 1. 전체 요약 (스칼라 1행) ──
CREATE OR REPLACE FUNCTION admin_byeoljari_summary(p_exclude UUID[])
RETURNS TABLE (
  total_maps BIGINT, maps_login BIGINT, maps_anon BIGINT,
  entry_uv BIGINT, landing_uv BIGINT,
  total_members BIGINT, name_public_members BIGINT, invite_clicks BIGINT,
  signups_utm BIGINT, member_signups BIGINT, cohort_size BIGINT,
  cohort_payers BIGINT, cohort_revenue BIGINT,
  total_users BIGINT, total_payers BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH member_anons AS (
    SELECT DISTINCT m.member_anon_id AS anon_id
    FROM star_map_members m
    JOIN star_maps sm ON sm.id = m.map_id
    WHERE m.is_host = false
      AND m.member_anon_id IS NOT NULL
      AND m.member_anon_id <> sm.creator_anon_id
  ), member_users AS (
    SELECT DISTINCT pv.user_id AS user_id
    FROM page_views pv
    JOIN member_anons ma ON ma.anon_id = pv.anon_id
    WHERE pv.user_id IS NOT NULL
      AND pv.user_id <> ALL(p_exclude)
      AND pv.is_bot = false
  ), utm_users AS (
    SELECT DISTINCT ua.user_id AS user_id
    FROM user_acquisition ua
    WHERE ua.utm_source = 'byeoljari'
      AND ua.user_id <> ALL(p_exclude)
  ), cohort AS (
    SELECT user_id FROM member_users
    UNION
    SELECT user_id FROM utm_users
  ), cohort_pay AS (
    SELECT p.user_id AS user_id, p.amount_won AS amount_won
    FROM payments p
    JOIN cohort c ON c.user_id = p.user_id
    WHERE p.status = 'completed'
  )
  SELECT
    (SELECT count(*) FROM star_maps sm
       WHERE sm.owner_user_id IS NULL OR sm.owner_user_id <> ALL(p_exclude))::BIGINT,
    (SELECT count(*) FROM star_maps sm WHERE sm.owner_user_id IS NOT NULL
       AND sm.owner_user_id <> ALL(p_exclude))::BIGINT,
    (SELECT count(*) FROM star_maps sm WHERE sm.owner_user_id IS NULL)::BIGINT,
    (SELECT count(DISTINCT pv.anon_id) FROM page_views pv
       WHERE pv.path = '/fortune/byeoljari' AND pv.is_bot = false
         AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(DISTINCT pv.anon_id) FROM page_views pv
       WHERE pv.path = '/fortune/byeoljari/:shareId' AND pv.is_bot = false
         AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM star_map_members m WHERE m.is_host = false)::BIGINT,
    (SELECT count(*) FROM star_map_members m WHERE m.is_host = false AND m.name_public)::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'byeoljari_invite_clicked'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM utm_users)::BIGINT,
    (SELECT count(*) FROM member_users)::BIGINT,
    (SELECT count(*) FROM cohort)::BIGINT,
    (SELECT count(DISTINCT cp.user_id) FROM cohort_pay cp)::BIGINT,
    (SELECT coalesce(sum(cp.amount_won), 0) FROM cohort_pay cp)::BIGINT,
    (SELECT count(*) FROM users u WHERE u.id <> ALL(p_exclude))::BIGINT,
    (SELECT count(DISTINCT p.user_id) FROM payments p
       WHERE p.status = 'completed' AND p.user_id <> ALL(p_exclude))::BIGINT;
$$;

-- ── 2. 일별 추세 (bucket, kind, cnt) — relationship_dist 의 long 포맷 관행 ──
-- 앱에서 bucket×kind 로 피벗. cohort_revenue 의 cnt 는 원화 합(kind 로 구분되니 무해).
CREATE OR REPLACE FUNCTION admin_byeoljari_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, kind TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH member_anons AS (
    SELECT DISTINCT m.member_anon_id AS anon_id
    FROM star_map_members m
    JOIN star_maps sm ON sm.id = m.map_id
    WHERE m.is_host = false AND m.member_anon_id IS NOT NULL
      AND m.member_anon_id <> sm.creator_anon_id
  ), member_users AS (
    SELECT DISTINCT pv.user_id AS user_id
    FROM page_views pv JOIN member_anons ma ON ma.anon_id = pv.anon_id
    WHERE pv.user_id IS NOT NULL AND pv.user_id <> ALL(p_exclude) AND pv.is_bot = false
  ), utm_users AS (
    SELECT DISTINCT ua.user_id AS user_id
    FROM user_acquisition ua
    WHERE ua.utm_source = 'byeoljari' AND ua.user_id <> ALL(p_exclude)
  ), cohort AS (
    SELECT user_id FROM member_users UNION SELECT user_id FROM utm_users
  )
  SELECT (sm.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'maps_created', count(*)
    FROM star_maps sm
    WHERE sm.created_at >= p_since
      AND (sm.owner_user_id IS NULL OR sm.owner_user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'entry_uv', count(DISTINCT pv.anon_id)
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/fortune/byeoljari' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'landing_uv', count(DISTINCT pv.anon_id)
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/fortune/byeoljari/:shareId' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (m.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'member_joins', count(*)
    FROM star_map_members m
    WHERE m.created_at >= p_since AND m.is_host = false
    GROUP BY 1
  UNION ALL
  SELECT (e.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'invite_clicks', count(*)
    FROM ui_events e
    WHERE e.created_at >= p_since AND e.event = 'byeoljari_invite_clicked'
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (ua.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'signups_utm', count(*)
    FROM user_acquisition ua
    WHERE ua.created_at >= p_since AND ua.utm_source = 'byeoljari'
      AND ua.user_id <> ALL(p_exclude)
    GROUP BY 1
  UNION ALL
  SELECT (p.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'cohort_payments', count(*)
    FROM payments p JOIN cohort c ON c.user_id = p.user_id
    WHERE p.created_at >= p_since AND p.status = 'completed'
    GROUP BY 1
  UNION ALL
  SELECT (p.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'cohort_revenue', coalesce(sum(p.amount_won), 0)
    FROM payments p JOIN cohort c ON c.user_id = p.user_id
    WHERE p.created_at >= p_since AND p.status = 'completed'
    GROUP BY 1
  ORDER BY 1;
$$;

-- ── 3. 지도당 멤버 수 분포 (백분위 + 히스토그램, 스칼라 1행) ──
-- 전체 맵 기준(멤버 0 포함) — "만든 사람마다 초대한 지인 수" 분포. 멤버 = 비호스트.
CREATE OR REPLACE FUNCTION admin_byeoljari_member_dist(p_exclude UUID[])
RETURNS TABLE (
  avg_members NUMERIC, p50 DOUBLE PRECISION, p75 DOUBLE PRECISION, p90 DOUBLE PRECISION,
  max_members BIGINT,
  maps_0 BIGINT, maps_1 BIGINT, maps_2_3 BIGINT, maps_4_6 BIGINT, maps_7_10 BIGINT, maps_11plus BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mc AS (
    SELECT sm.id AS map_id,
           count(m.id) FILTER (WHERE m.is_host = false) AS n
    FROM star_maps sm
    LEFT JOIN star_map_members m ON m.map_id = sm.id
    WHERE sm.owner_user_id IS NULL OR sm.owner_user_id <> ALL(p_exclude)
    GROUP BY sm.id
  )
  SELECT
    coalesce(round(avg(mc.n), 1), 0),
    coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY mc.n), 0),
    coalesce(percentile_cont(0.75) WITHIN GROUP (ORDER BY mc.n), 0),
    coalesce(percentile_cont(0.90) WITHIN GROUP (ORDER BY mc.n), 0),
    coalesce(max(mc.n), 0)::BIGINT,
    count(*) FILTER (WHERE mc.n = 0)::BIGINT,
    count(*) FILTER (WHERE mc.n = 1)::BIGINT,
    count(*) FILTER (WHERE mc.n BETWEEN 2 AND 3)::BIGINT,
    count(*) FILTER (WHERE mc.n BETWEEN 4 AND 6)::BIGINT,
    count(*) FILTER (WHERE mc.n BETWEEN 7 AND 10)::BIGINT,
    count(*) FILTER (WHERE mc.n >= 11)::BIGINT
  FROM mc;
$$;

-- ── 권한: service_role 전용 (AGENTS.md — PUBLIC·anon·authenticated 셋 다 명시 회수 + 시그니처 명시) ──
REVOKE EXECUTE ON FUNCTION admin_byeoljari_summary(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeoljari_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeoljari_member_dist(UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_byeoljari_summary(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeoljari_trend(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeoljari_member_dist(UUID[]) TO service_role;
