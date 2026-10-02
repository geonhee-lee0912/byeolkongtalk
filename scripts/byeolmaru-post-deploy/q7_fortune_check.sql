-- Q7 재검증: 유료 사주/운세 리포트 구매가 09-28 이후 멈춘 게 맞나 (최근 24일 일별)
WITH ex AS (SELECT ARRAY['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'] AS p)
SELECT (t.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date AS d,
       count(*) FILTER (WHERE left(t.source,8)='fortune_')            AS fortune_cnt,
       coalesce(sum(t.amount) FILTER (WHERE left(t.source,8)='fortune_'),0) AS fortune_stars,
       count(*) FILTER (WHERE t.source='tarot_reading')               AS tarot_cnt
FROM star_transactions t, ex
WHERE t.created_at >= '2026-09-08T15:00:00Z' AND t.type='spend'
  AND (t.user_id IS NULL OR left(t.user_id::text,8) <> ALL(ex.p))
GROUP BY 1 ORDER BY 1;
