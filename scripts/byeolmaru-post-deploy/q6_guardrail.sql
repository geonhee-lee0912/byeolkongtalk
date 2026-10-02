-- Q6 가드레일: 배포 직전 4일(09-24~27) vs 직후 4일(09-28~10-01) 사이트 핵심지표
WITH ex AS (SELECT ARRAY['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'] AS p),
win AS (SELECT '2026-09-23T15:00:00Z'::timestamptz a0, '2026-09-27T15:00:00Z'::timestamptz a1,
               '2026-10-01T15:00:00Z'::timestamptz a2)
SELECT 'users_signup' AS metric, '*' AS k,
  count(*) FILTER (WHERE u.created_at >= w.a0 AND u.created_at < w.a1) AS pre4d,
  count(*) FILTER (WHERE u.created_at >= w.a1 AND u.created_at < w.a2) AS post4d
FROM users u, ex, win w
WHERE u.created_at >= w.a0 AND u.created_at < w.a2 AND left(u.id::text,8) <> ALL(ex.p)
UNION ALL
SELECT 'readings', r.consultation_type,
  count(*) FILTER (WHERE r.created_at >= w.a0 AND r.created_at < w.a1),
  count(*) FILTER (WHERE r.created_at >= w.a1 AND r.created_at < w.a2)
FROM readings r, ex, win w
WHERE r.created_at >= w.a0 AND r.created_at < w.a2
  AND (r.user_id IS NULL OR left(r.user_id::text,8) <> ALL(ex.p))
GROUP BY r.consultation_type
UNION ALL
SELECT 'stars_spent', t.source,
  coalesce(sum(t.amount) FILTER (WHERE t.created_at >= w.a0 AND t.created_at < w.a1),0),
  coalesce(sum(t.amount) FILTER (WHERE t.created_at >= w.a1 AND t.created_at < w.a2),0)
FROM star_transactions t, ex, win w
WHERE t.created_at >= w.a0 AND t.created_at < w.a2 AND t.type = 'spend'
  AND (t.user_id IS NULL OR left(t.user_id::text,8) <> ALL(ex.p))
GROUP BY t.source
UNION ALL
SELECT 'revenue_won', p.package_type,
  coalesce(sum(p.amount_won) FILTER (WHERE p.created_at >= w.a0 AND p.created_at < w.a1),0),
  coalesce(sum(p.amount_won) FILTER (WHERE p.created_at >= w.a1 AND p.created_at < w.a2),0)
FROM payments p, ex, win w
WHERE p.created_at >= w.a0 AND p.created_at < w.a2 AND p.status = 'completed'
  AND (p.user_id IS NULL OR left(p.user_id::text,8) <> ALL(ex.p))
GROUP BY p.package_type
ORDER BY 1,2;
