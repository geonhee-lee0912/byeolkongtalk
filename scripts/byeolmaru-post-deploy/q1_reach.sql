-- Q1 별마루 도달: 일별 지면별 PV/UV + 사이트 전체 UV(침투율 분모)
WITH ex AS (SELECT ARRAY['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'] AS p),
pv AS (
  SELECT (created_at AT TIME ZONE 'UTC' + interval '9 hours')::date AS d,
         path, coalesce(user_id::text, anon_id) AS actor
  FROM page_views, ex
  WHERE created_at >= '2026-09-21T15:00:00Z' AND is_bot = false
    AND (user_id IS NULL OR left(user_id::text,8) <> ALL(ex.p))
)
SELECT d,
  count(*) FILTER (WHERE path LIKE '/byeolmaru%')                       AS bm_pv,
  count(DISTINCT actor) FILTER (WHERE path LIKE '/byeolmaru%')          AS bm_uv,
  count(DISTINCT actor) FILTER (WHERE path = '/byeolmaru')              AS hub_uv,
  count(DISTINCT actor) FILTER (WHERE path LIKE '/byeolmaru/day%')      AS day_uv,
  count(DISTINCT actor) FILTER (WHERE path LIKE '/byeolmaru/saju%')     AS saju_uv,
  count(DISTINCT actor) FILTER (WHERE path LIKE '/byeolmaru/woori%')    AS woori_uv,
  count(DISTINCT actor)                                                 AS site_uv,
  round(100.0 * count(DISTINCT actor) FILTER (WHERE path LIKE '/byeolmaru%')
        / nullif(count(DISTINCT actor),0), 1)                           AS bm_share_pct
FROM pv GROUP BY d ORDER BY d;
