-- 20260905010000_admin_byeolmaru_watch.sql — 우리 오늘 담기 퍼널 + 상대 수 분포.
-- ④ admin_byeolmaru_* 미러. 누적(날짜 그룹 없음) → AT TIME ZONE 트랩 무관.
-- exclude: ui_events 는 NULL-safe, byeolmaru_watch 는 user_id NOT NULL(FK)이라 단독.
-- 이벤트는 정확 매칭(ANY(ARRAY[...]))만 — LIKE '_' 와일드카드 트랩 회피.
-- 스펙: docs/superpowers/specs/2026-09-05-별마루-3-우리오늘-design.md §9

CREATE OR REPLACE FUNCTION admin_byeolmaru_watch_summary(p_exclude UUID[])
RETURNS TABLE (
  partner_selected_events BIGINT, partner_selected_actors BIGINT,
  watch_add_events BIGINT, watch_add_actors BIGINT,
  watch_limit_events BIGINT, watch_limit_actors BIGINT,
  watch_purchase_events BIGINT, watch_purchase_actors BIGINT,
  woori_cta_events BIGINT, woori_cta_actors BIGINT,
  woori_converted_actors BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT e.event AS ev_name, coalesce(e.user_id::text, e.anon_id) AS actor
    FROM ui_events e
    WHERE e.event = ANY(ARRAY[
      'byeolmaru_partner_selected','byeolmaru_watch_add','byeolmaru_watch_limit',
      'byeolmaru_watch_purchase','byeolmaru_subscribe_from_woori','byeolmaru_subscribe_completed'
    ])
      AND (e.user_id IS NULL OR e.user_id <> ALL(p_exclude))
  )
  SELECT
    count(*) FILTER (WHERE ev_name='byeolmaru_partner_selected')::BIGINT,
    count(DISTINCT actor) FILTER (WHERE ev_name='byeolmaru_partner_selected')::BIGINT,
    count(*) FILTER (WHERE ev_name='byeolmaru_watch_add')::BIGINT,
    count(DISTINCT actor) FILTER (WHERE ev_name='byeolmaru_watch_add')::BIGINT,
    count(*) FILTER (WHERE ev_name='byeolmaru_watch_limit')::BIGINT,
    count(DISTINCT actor) FILTER (WHERE ev_name='byeolmaru_watch_limit')::BIGINT,
    count(*) FILTER (WHERE ev_name='byeolmaru_watch_purchase')::BIGINT,
    count(DISTINCT actor) FILTER (WHERE ev_name='byeolmaru_watch_purchase')::BIGINT,
    count(*) FILTER (WHERE ev_name='byeolmaru_subscribe_from_woori')::BIGINT,
    count(DISTINCT actor) FILTER (WHERE ev_name='byeolmaru_subscribe_from_woori')::BIGINT,
    (SELECT count(DISTINCT actor) FROM ev
       WHERE ev_name='byeolmaru_subscribe_from_woori'
         AND actor IN (SELECT actor FROM ev WHERE ev_name='byeolmaru_subscribe_completed'))::BIGINT
  FROM ev;
$$;

CREATE OR REPLACE FUNCTION admin_byeolmaru_watch_distribution(p_exclude UUID[])
RETURNS TABLE (watch_count INT, user_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT wc::INT, count(*)::BIGINT
  FROM (
    SELECT w.user_id, count(*) AS wc
    FROM byeolmaru_watch w
    WHERE w.user_id <> ALL(p_exclude)
    GROUP BY w.user_id
  ) t
  GROUP BY wc
  ORDER BY wc;
$$;

REVOKE EXECUTE ON FUNCTION admin_byeolmaru_watch_summary(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_byeolmaru_watch_distribution(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_byeolmaru_watch_summary(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_byeolmaru_watch_distribution(UUID[]) TO service_role;
