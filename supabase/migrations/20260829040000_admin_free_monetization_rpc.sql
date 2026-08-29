-- 무료상품 유료화 지표 RPC (2026-08-29) — 리텐션(양쪽) + 결과유형×결제(MBTI).
-- 리텐션: action(완료/생성) anon 이 이후 '더 늦은 KST 날'에 N일 내 재방문(page_views) 했나.
--   eligible = action 이 N일 전(관측창 성숙). returned = eligible ∩ N일내 재방문. 같은 기기 하한.
-- 유형×결제: 로그인 완료자(meta.band/palja) × payments(status=completed). 로그인만=표본편향.

CREATE OR REPLACE FUNCTION admin_saju_mbti_retention(p_exclude UUID[])
RETURNS TABLE (horizon TEXT, eligible BIGINT, returned BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT e.anon_id AS anon, min(e.created_at) AS action_at
    FROM ui_events e
    WHERE e.event = 'saju_mbti_completed' AND e.anon_id IS NOT NULL
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY e.anon_id
  ), flagged AS (
    SELECT b.anon, b.action_at,
      EXISTS(SELECT 1 FROM page_views pv WHERE pv.anon_id = b.anon AND pv.is_bot = false
        AND (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date
            > (b.action_at AT TIME ZONE 'UTC' + interval '9 hours')::date
        AND pv.created_at <= b.action_at + interval '1 day') AS r1,
      EXISTS(SELECT 1 FROM page_views pv WHERE pv.anon_id = b.anon AND pv.is_bot = false
        AND (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date
            > (b.action_at AT TIME ZONE 'UTC' + interval '9 hours')::date
        AND pv.created_at <= b.action_at + interval '7 days') AS r7,
      EXISTS(SELECT 1 FROM page_views pv WHERE pv.anon_id = b.anon AND pv.is_bot = false
        AND (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date
            > (b.action_at AT TIME ZONE 'UTC' + interval '9 hours')::date
        AND pv.created_at <= b.action_at + interval '30 days') AS r30
    FROM base b
  )
  SELECT 'd1', count(*) FILTER (WHERE action_at <= now() - interval '1 day')::BIGINT,
              count(*) FILTER (WHERE action_at <= now() - interval '1 day' AND r1)::BIGINT FROM flagged
  UNION ALL
  SELECT 'd7', count(*) FILTER (WHERE action_at <= now() - interval '7 days')::BIGINT,
              count(*) FILTER (WHERE action_at <= now() - interval '7 days' AND r7)::BIGINT FROM flagged
  UNION ALL
  SELECT 'd30', count(*) FILTER (WHERE action_at <= now() - interval '30 days')::BIGINT,
              count(*) FILTER (WHERE action_at <= now() - interval '30 days' AND r30)::BIGINT FROM flagged;
$$;

CREATE OR REPLACE FUNCTION admin_byeoljari_retention(p_exclude UUID[])
RETURNS TABLE (horizon TEXT, eligible BIGINT, returned BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT sm.creator_anon_id AS anon, min(sm.created_at) AS action_at
    FROM star_maps sm
    WHERE sm.creator_anon_id IS NOT NULL
      AND (sm.owner_user_id IS NULL OR sm.owner_user_id <> ALL(p_exclude))
    GROUP BY sm.creator_anon_id
  ), flagged AS (
    SELECT b.anon, b.action_at,
      EXISTS(SELECT 1 FROM page_views pv WHERE pv.anon_id = b.anon AND pv.is_bot = false
        AND (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date
            > (b.action_at AT TIME ZONE 'UTC' + interval '9 hours')::date
        AND pv.created_at <= b.action_at + interval '1 day') AS r1,
      EXISTS(SELECT 1 FROM page_views pv WHERE pv.anon_id = b.anon AND pv.is_bot = false
        AND (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date
            > (b.action_at AT TIME ZONE 'UTC' + interval '9 hours')::date
        AND pv.created_at <= b.action_at + interval '7 days') AS r7,
      EXISTS(SELECT 1 FROM page_views pv WHERE pv.anon_id = b.anon AND pv.is_bot = false
        AND (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date
            > (b.action_at AT TIME ZONE 'UTC' + interval '9 hours')::date
        AND pv.created_at <= b.action_at + interval '30 days') AS r30
    FROM base b
  )
  SELECT 'd1', count(*) FILTER (WHERE action_at <= now() - interval '1 day')::BIGINT,
              count(*) FILTER (WHERE action_at <= now() - interval '1 day' AND r1)::BIGINT FROM flagged
  UNION ALL
  SELECT 'd7', count(*) FILTER (WHERE action_at <= now() - interval '7 days')::BIGINT,
              count(*) FILTER (WHERE action_at <= now() - interval '7 days' AND r7)::BIGINT FROM flagged
  UNION ALL
  SELECT 'd30', count(*) FILTER (WHERE action_at <= now() - interval '30 days')::BIGINT,
              count(*) FILTER (WHERE action_at <= now() - interval '30 days' AND r30)::BIGINT FROM flagged;
$$;

CREATE OR REPLACE FUNCTION admin_saju_mbti_type_payment(p_exclude UUID[])
RETURNS TABLE (dim TEXT, key TEXT, completers BIGINT, payers BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH comp AS (
    SELECT DISTINCT e.user_id AS uid, e.meta->>'band' AS band, e.meta->>'palja' AS palja
    FROM ui_events e
    WHERE e.event = 'saju_mbti_completed' AND e.user_id IS NOT NULL
      AND e.user_id <> ALL(p_exclude)
  ), payers AS (
    SELECT DISTINCT p.user_id AS uid FROM payments p
    WHERE p.status = 'completed' AND p.user_id IS NOT NULL
  )
  SELECT 'band', c.band, count(DISTINCT c.uid)::BIGINT,
         count(DISTINCT c.uid) FILTER (WHERE c.uid IN (SELECT uid FROM payers))::BIGINT
  FROM comp c WHERE c.band IS NOT NULL GROUP BY c.band
  UNION ALL
  SELECT 'palja', c.palja, count(DISTINCT c.uid)::BIGINT,
         count(DISTINCT c.uid) FILTER (WHERE c.uid IN (SELECT uid FROM payers))::BIGINT
  FROM comp c WHERE c.palja IS NOT NULL GROUP BY c.palja
  ORDER BY 1, 4 DESC;
$$;

REVOKE EXECUTE ON FUNCTION admin_saju_mbti_retention(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeoljari_retention(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_saju_mbti_type_payment(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_saju_mbti_retention(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeoljari_retention(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_saju_mbti_type_payment(UUID[]) TO service_role;
