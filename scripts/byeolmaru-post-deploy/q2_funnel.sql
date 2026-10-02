-- Q2 별마루 페이월 퍼널 (배포 이후 창): 노출 -> 체험 -> 구독클릭 -> 구독완료
WITH ex AS (SELECT ARRAY['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'] AS p),
evt AS (
  SELECT replace(event,'byeolmaru_','') AS stage,
         coalesce(meta->>'slot','(없음)') AS slot,
         coalesce(user_id::text, anon_id) AS actor
  FROM ui_events, ex
  WHERE created_at >= '2026-09-27T15:00:00Z'
    AND event = ANY(ARRAY['byeolmaru_gate_shown','byeolmaru_trial_started',
                          'byeolmaru_subscribe_clicked','byeolmaru_subscribe_completed'])
    AND (user_id IS NULL OR left(user_id::text,8) <> ALL(ex.p))
)
SELECT stage,
       CASE WHEN grouping(slot)=1 THEN '*' ELSE slot END AS slot,
       count(*) AS events, count(DISTINCT actor) AS actors
FROM evt GROUP BY GROUPING SETS ((stage,slot),(stage)) ORDER BY 1,2;
