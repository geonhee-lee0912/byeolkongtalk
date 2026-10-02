-- Q5 별마루 리텐션: 배포 후 별마루를 본 사람의 방문일수 분포 + 출석 연속
WITH ex AS (SELECT ARRAY['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'] AS p),
v AS (
  SELECT coalesce(pv.user_id::text, pv.anon_id) AS actor,
         (pv.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date AS d
  FROM page_views pv, ex
  WHERE pv.created_at >= '2026-09-27T15:00:00Z' AND pv.is_bot = false
    AND pv.path LIKE '/byeolmaru%'
    AND (pv.user_id IS NULL OR left(pv.user_id::text,8) <> ALL(ex.p))
  GROUP BY 1,2
),
per AS (SELECT actor, count(*) AS days, min(d) AS first_d FROM v GROUP BY actor)
SELECT 'bm_visit_days' AS metric, days::text AS k, count(*) AS actors FROM per GROUP BY days
UNION ALL
SELECT 'bm_first_seen', first_d::text, count(*) FROM per GROUP BY first_d
UNION ALL
SELECT 'checkin_days', c.n::text, count(*) FROM (
  SELECT t.user_id, count(*) AS n FROM byeolmaru_checkins t, ex
  WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
  GROUP BY t.user_id) c GROUP BY c.n
ORDER BY 1,2;
