-- Q3 참여/이탈/진입경로 (배포 이후 창)
WITH ex AS (SELECT ARRAY['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'] AS p),
evt AS (
  SELECT event,
         coalesce(meta->>'item', meta->>'to', meta->>'kind', meta->>'card',
                  meta->>'via', meta->>'status', meta->>'action',
                  meta->>'block', meta->>'product', '(없음)') AS key,
         coalesce(user_id::text, anon_id) AS actor
  FROM ui_events, ex
  WHERE created_at >= '2026-09-27T15:00:00Z'
    AND (event LIKE 'byeolmaru%' OR event LIKE 'home_%' OR event = 'result_cta_clicked')
    AND (user_id IS NULL OR left(user_id::text,8) <> ALL(ex.p))
)
SELECT event, key, count(*) AS events, count(DISTINCT actor) AS actors
FROM evt GROUP BY 1,2 ORDER BY 3 DESC, 1, 2;
