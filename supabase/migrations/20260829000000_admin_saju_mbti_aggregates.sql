-- 사주 MBTI(무료 서비스) 어드민 집계 RPC (2026-08-29)
-- MBTI 는 서버 기록 0 → page_views(방문) + ui_events(퍼널·결과코드 meta) 만이 원천.
-- byeoljari aggregates(20260823000000) 관행 그대로: KST 자정, is_bot 제외(pv),
-- 어드민 제외는 (user_id IS NULL OR user_id <> ALL(p_exclude)).
-- ⚠️ 이벤트 필터는 event IN (...) 명시 리스트 — LIKE 'saju_mbti_%' 금지(_ 는 와일드카드).

-- ── 1. 요약 (스칼라 1행) ──
CREATE OR REPLACE FUNCTION admin_saju_mbti_summary(p_exclude UUID[])
RETURNS TABLE (
  visits BIGINT, started BIGINT, birth BIGINT, completed BIGINT,
  shared BIGINT, shared_view BIGINT, retry BIGINT, utm_signups BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(DISTINCT pv.anon_id) FROM page_views pv
       WHERE pv.path = '/fortune/saju-mbti' AND pv.is_bot = false
         AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'saju_mbti_started'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'saju_mbti_birth'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'saju_mbti_completed'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'saju_mbti_shared'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'saju_mbti_shared_view'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM ui_events e WHERE e.event = 'saju_mbti_retry'
       AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude)))::BIGINT,
    (SELECT count(*) FROM user_acquisition ua
       WHERE ua.utm_source = 'saju_mbti' AND ua.user_id <> ALL(p_exclude))::BIGINT;
$$;

-- ── 2. 결과 유형 분포 (kind, key, cnt) — completed meta 에서 ──
CREATE OR REPLACE FUNCTION admin_saju_mbti_type_dist(p_exclude UUID[])
RETURNS TABLE (kind TEXT, key TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'palja', e.meta->>'palja', count(*)::BIGINT FROM ui_events e
    WHERE e.event = 'saju_mbti_completed' AND e.meta->>'palja' IS NOT NULL
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 2
  UNION ALL
  SELECT 'band', e.meta->>'band', count(*)::BIGINT FROM ui_events e
    WHERE e.event = 'saju_mbti_completed' AND e.meta->>'band' IS NOT NULL
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 2
  UNION ALL
  SELECT 'element', e.meta->>'element', count(*)::BIGINT FROM ui_events e
    WHERE e.event = 'saju_mbti_completed' AND e.meta->>'element' IS NOT NULL
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 2
  ORDER BY 1, 3 DESC;
$$;

-- ── 3. 일별 추세 (bucket, kind, cnt) — long 포맷, 앱에서 피벗 ──
CREATE OR REPLACE FUNCTION admin_saju_mbti_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, kind TEXT, cnt BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, 'visits',
         count(DISTINCT pv.anon_id)
    FROM page_views pv
    WHERE pv.created_at >= p_since AND pv.path = '/fortune/saju-mbti' AND pv.is_bot = false
      AND (pv.user_id IS NULL OR pv.user_id <> ALL(p_exclude))
    GROUP BY 1
  UNION ALL
  SELECT (e.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date, e.event, count(*)
    FROM ui_events e
    WHERE e.created_at >= p_since
      AND e.event IN ('saju_mbti_started','saju_mbti_completed','saju_mbti_shared','saju_mbti_retry')
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
    GROUP BY 1, 2
  ORDER BY 1;
$$;

-- ── 권한: service_role 전용 ──
REVOKE EXECUTE ON FUNCTION admin_saju_mbti_summary(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_saju_mbti_type_dist(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_saju_mbti_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_saju_mbti_summary(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_saju_mbti_type_dist(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_saju_mbti_trend(TIMESTAMPTZ, UUID[]) TO service_role;
