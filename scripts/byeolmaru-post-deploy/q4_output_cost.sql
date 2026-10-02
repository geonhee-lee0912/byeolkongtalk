-- Q4 산출물 + LLM 원가 (배포 이후 창)
WITH ex AS (SELECT ARRAY['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'] AS p)
SELECT '산출물' AS cat, '오늘 사주 리포트' AS k, count(*) AS cnt, count(DISTINCT t.user_id) AS users, NULL::numeric AS won
  FROM byeolmaru_daily_report t, ex WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
UNION ALL SELECT '산출물','오늘 타로 카드',count(*),count(DISTINCT t.user_id),NULL
  FROM byeolmaru_daily_card t, ex WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
UNION ALL SELECT '산출물','타로 카드 해설',count(*),count(DISTINCT t.user_id),NULL
  FROM byeolmaru_card_narrative t, ex WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
UNION ALL SELECT '산출물','우리 오늘 리포트',count(*),count(DISTINCT t.user_id),NULL
  FROM byeolmaru_pair_narrative t, ex WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
UNION ALL SELECT '산출물','출석',count(*),count(DISTINCT t.user_id),NULL
  FROM byeolmaru_checkins t, ex WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
UNION ALL SELECT '산출물','상대 등록',count(*),count(DISTINCT t.user_id),NULL
  FROM byeolmaru_watch t, ex WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
UNION ALL SELECT '산출물','구독',count(*),count(DISTINCT t.user_id),sum(t.stars_spent)::numeric
  FROM byeolmaru_subscriptions t, ex WHERE t.created_at >= '2026-09-27T15:00:00Z' AND left(t.user_id::text,8) <> ALL(ex.p)
UNION ALL SELECT '원가', u.route || ' · ' || u.model, count(*), count(DISTINCT u.user_id), round(coalesce(sum(u.cost_won),0),2)
  FROM llm_usage u, ex WHERE u.created_at >= '2026-09-27T15:00:00Z' AND u.route LIKE '/api/byeolmaru/%'
    AND (u.user_id IS NULL OR left(u.user_id::text,8) <> ALL(ex.p))
  GROUP BY u.route, u.model
ORDER BY 1,2;
