-- 2026-07-16 페이월 퍼널 연장 비교 분석 (07-13 설계 계승)
-- 제외 6명 (d8fdcdd0 지인 추가): 모든 쿼리 공통 필터
-- 패치 경계: pre-2026-07-12 / 2026-07-12-persona-tuning / 2026-07-13-conversion-c3

-- ============ Q1a — 퍼널 top-line ============
WITH u AS (
  SELECT id AS user_id FROM users
  WHERE left(id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
bal AS (
  SELECT user_id, balance, total_spent FROM star_balances
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
pay AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status='completed') AS paid_cnt,
    COALESCE(SUM(amount_won) FILTER (WHERE status='completed'),0) AS rev_won
  FROM payments
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  GROUP BY user_id
),
flags AS (
  SELECT u.user_id,
    COALESCE(b.total_spent,0) > 0 AS tried,
    (COALESCE(b.total_spent,0) > 0 AND COALESCE(b.balance,0) < 10) AS reached,
    COALESCE(p.paid_cnt,0) >= 1 AS converted,
    COALESCE(p.paid_cnt,0) >= 2 AS repaid,
    COALESCE(p.rev_won,0) AS rev_won
  FROM u
  LEFT JOIN bal b ON b.user_id = u.user_id
  LEFT JOIN pay p ON p.user_id = u.user_id
)
SELECT
  COUNT(*)                          AS signups,
  COUNT(*) FILTER (WHERE tried)     AS tried,
  COUNT(*) FILTER (WHERE reached)   AS reached,
  COUNT(*) FILTER (WHERE converted) AS converted,
  COUNT(*) FILTER (WHERE repaid)    AS repaid,
  SUM(rev_won)                      AS revenue_won
FROM flags;

-- ============ Q1b — 소재별 퍼널 + CAC/ROAS ============
WITH bal AS (
  SELECT user_id, balance, total_spent FROM star_balances
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
pay AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status='completed') AS paid_cnt,
    COALESCE(SUM(amount_won) FILTER (WHERE status='completed'),0) AS rev_won
  FROM payments
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  GROUP BY user_id
),
acq AS (
  SELECT u.id AS user_id, COALESCE(a.utm_content, '(organic/untracked)') AS creative
  FROM users u LEFT JOIN user_acquisition a ON a.user_id = u.id
  WHERE left(u.id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
flags AS (
  SELECT acq.creative, acq.user_id,
    COALESCE(b.total_spent,0) > 0 AS tried,
    (COALESCE(b.total_spent,0) > 0 AND COALESCE(b.balance,0) < 10) AS reached,
    COALESCE(p.paid_cnt,0) >= 1 AS converted,
    COALESCE(p.rev_won,0) AS rev_won
  FROM acq
  LEFT JOIN bal b ON b.user_id = acq.user_id
  LEFT JOIN pay p ON p.user_id = acq.user_id
),
spend AS (SELECT creative_key, SUM(spend_won) AS spend_won FROM ad_spend GROUP BY creative_key)
SELECT f.creative,
  COUNT(*)                          AS signups,
  COUNT(*) FILTER (WHERE tried)     AS tried,
  COUNT(*) FILTER (WHERE reached)   AS reached,
  COUNT(*) FILTER (WHERE converted) AS converted,
  SUM(f.rev_won)                    AS revenue_won,
  s.spend_won,
  CASE WHEN s.spend_won > 0 THEN ROUND(s.spend_won::numeric / NULLIF(COUNT(*),0)) END AS cac,
  CASE WHEN s.spend_won > 0 THEN ROUND(SUM(f.rev_won)::numeric / s.spend_won, 2) END AS roas
FROM flags f
LEFT JOIN spend s ON s.creative_key = f.creative
GROUP BY f.creative, s.spend_won
ORDER BY signups DESC;

-- ============ Q2 — 무료 런웨이 ============
WITH r AS (
  SELECT user_id,
    COUNT(*) AS readings_all,
    COUNT(*) FILTER (WHERE emotion_tag IS NULL OR emotion_tag NOT LIKE 'fortune:%') AS consult_readings,
    COUNT(*) FILTER (WHERE emotion_tag LIKE 'fortune:%') AS fortune_readings
  FROM readings
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  GROUP BY user_id
),
b AS (
  SELECT user_id, total_spent FROM star_balances
  WHERE total_spent > 0 AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
)
SELECT
  COUNT(*)                                   AS tried_users,
  ROUND(AVG(r.readings_all), 2)              AS avg_readings,
  ROUND(AVG(r.consult_readings), 2)          AS avg_consult,
  ROUND(AVG(b.total_spent), 1)               AS avg_stars_spent,
  COUNT(*) FILTER (WHERE r.readings_all = 1) AS only_1_reading,
  COUNT(*) FILTER (WHERE r.readings_all = 2) AS exactly_2,
  COUNT(*) FILTER (WHERE r.readings_all >= 3) AS three_plus
FROM b JOIN r ON r.user_id = b.user_id;

-- ============ Q3 — 대화 상태 × 전환 × prompt_version ============
WITH base AS (
  SELECT r.id, r.user_id, r.consultation_type, r.prompt_version,
    (r.result_viewed_at IS NOT NULL) AS result_viewed,
    COALESCE(SUM((m.role='user')::int),0)      AS user_turns,
    COALESCE(SUM((m.role='assistant')::int),0) AS assistant_turns,
    BOOL_OR(m.role='assistant' AND m.content LIKE '%[END]%') AS has_end,
    (SELECT m2.role FROM messages m2 WHERE m2.reading_id = r.id
       ORDER BY m2.created_at DESC LIMIT 1) AS last_role
  FROM readings r
  LEFT JOIN messages m ON m.reading_id = r.id
  WHERE (r.emotion_tag IS NULL OR r.emotion_tag NOT LIKE 'fortune:%')
    AND left(r.user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  GROUP BY r.id
),
cls AS (
  SELECT b.*,
    CASE
      WHEN has_end THEN 'completed'
      WHEN assistant_turns = 0 THEN 'no_reading'
      WHEN user_turns = 0 THEN 'abandon_0turn'
      WHEN last_role = 'assistant' THEN 'abandon_mid'
      ELSE 'other'
    END AS state
  FROM base b
),
conv AS (
  SELECT DISTINCT user_id FROM payments
  WHERE status='completed' AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
)
SELECT
  c.consultation_type, c.prompt_version, c.state,
  (c.user_id IN (SELECT user_id FROM conv)) AS user_converted,
  COUNT(*)                              AS n,
  COUNT(*) FILTER (WHERE result_viewed) AS result_viewed_n
FROM cls c
GROUP BY c.consultation_type, c.prompt_version, c.state, user_converted
ORDER BY c.consultation_type, c.prompt_version, n DESC;

-- ============ Q4 — 리텐션/재방문 ============
WITH act AS (
  SELECT user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date AS d FROM readings
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  UNION
  SELECT user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM payments
  WHERE status='completed' AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
u AS (
  SELECT id AS user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date AS signup_d FROM users
  WHERE left(id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
bal AS (
  SELECT user_id, (total_spent>0 AND balance<10) AS reached FROM star_balances
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
conv AS (
  SELECT DISTINCT user_id FROM payments
  WHERE status='completed' AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
per AS (
  SELECT u.user_id, u.signup_d,
    COUNT(DISTINCT a.d)              AS active_days,
    BOOL_OR(a.d > u.signup_d)        AS revisited,
    COALESCE(b.reached,false)        AS reached,
    (u.user_id IN (SELECT user_id FROM conv)) AS converted
  FROM u
  LEFT JOIN act a ON a.user_id = u.user_id
  LEFT JOIN bal b ON b.user_id = u.user_id
  GROUP BY u.user_id, u.signup_d, b.reached
)
SELECT 'ALL' AS segment,
  COUNT(*) AS users,
  COUNT(*) FILTER (WHERE active_days >= 1) AS active_users,
  COUNT(*) FILTER (WHERE revisited)        AS revisited_users,
  ROUND(100.0*COUNT(*) FILTER (WHERE revisited)
        / NULLIF(COUNT(*) FILTER (WHERE active_days>=1),0), 1) AS revisit_pct_of_active,
  ROUND(AVG(active_days), 2) AS avg_active_days
FROM per
UNION ALL
SELECT 'REACHED', COUNT(*),
  COUNT(*) FILTER (WHERE active_days >= 1),
  COUNT(*) FILTER (WHERE revisited),
  ROUND(100.0*COUNT(*) FILTER (WHERE revisited)
        / NULLIF(COUNT(*) FILTER (WHERE active_days>=1),0), 1),
  ROUND(AVG(active_days), 2)
FROM per WHERE reached
UNION ALL
SELECT 'CONVERTED', COUNT(*),
  COUNT(*) FILTER (WHERE active_days >= 1),
  COUNT(*) FILTER (WHERE revisited),
  ROUND(100.0*COUNT(*) FILTER (WHERE revisited)
        / NULLIF(COUNT(*) FILTER (WHERE active_days>=1),0), 1),
  ROUND(AVG(active_days), 2)
FROM per WHERE converted;

-- ============ Q5 — 결제 마찰 (H3) ============
WITH reached AS (
  SELECT user_id FROM star_balances
  WHERE total_spent > 0 AND balance < 10
    AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
p AS (
  SELECT user_id,
    BOOL_OR(status='completed') AS has_completed,
    COUNT(*) AS pay_rows
  FROM payments
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  GROUP BY user_id
)
SELECT
  COUNT(*) AS reached,
  COUNT(*) FILTER (WHERE p.has_completed) AS converted,
  COUNT(*) FILTER (WHERE p.user_id IS NOT NULL AND NOT COALESCE(p.has_completed,false)) AS attempted_not_completed,
  COUNT(*) FILTER (WHERE p.user_id IS NULL) AS never_attempted
FROM reached rc
LEFT JOIN p ON p.user_id = rc.user_id;

-- ============ Q7 — 고민 분류별 전환 ============
WITH r AS (
  SELECT r.id, r.user_id, r.consultation_type,
    COALESCE(r.emotion_tag, '(없음)') AS topic
  FROM readings r
  WHERE (r.emotion_tag IS NULL OR r.emotion_tag NOT LIKE 'fortune:%')
    AND left(r.user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
conv AS (
  SELECT DISTINCT user_id FROM payments
  WHERE status='completed' AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
)
SELECT r.consultation_type, r.topic,
  COUNT(*) AS readings,
  COUNT(DISTINCT r.user_id) AS users,
  COUNT(DISTINCT r.user_id) FILTER (WHERE r.user_id IN (SELECT user_id FROM conv)) AS converted_users
FROM r
GROUP BY r.consultation_type, r.topic
ORDER BY readings DESC;

-- ============ Q8 — 상품별 매출 믹스 + 환불 ============
SELECT package_type, status,
  COUNT(*) AS n,
  COALESCE(SUM(amount_won),0) AS amount_won,
  COUNT(DISTINCT user_id) AS users
FROM payments
WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
GROUP BY package_type, status
ORDER BY package_type, status;

-- ============ Q9 — 코호트 LTV (주차별) ============
WITH u AS (
  SELECT id AS user_id,
    date_trunc('week', (created_at AT TIME ZONE 'Asia/Seoul'))::date AS cohort_week
  FROM users
  WHERE left(id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
rev AS (
  SELECT user_id, SUM(amount_won) AS rev_won
  FROM payments
  WHERE status='completed' AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  GROUP BY user_id
)
SELECT u.cohort_week,
  COUNT(*) AS cohort_size,
  COUNT(*) FILTER (WHERE COALESCE(r.rev_won,0) > 0) AS payers,
  COALESCE(SUM(r.rev_won),0) AS total_rev_won,
  ROUND(COALESCE(SUM(r.rev_won),0)::numeric / NULLIF(COUNT(*),0)) AS rev_per_user_won
FROM u LEFT JOIN rev r ON r.user_id = u.user_id
GROUP BY u.cohort_week
ORDER BY u.cohort_week DESC;

-- ============ Q10 (신규) — 패치 코호트별 유저 퍼널 ============
-- 유저의 "첫 상담 리딩" prompt_version 으로 코호트 배정 → 도달/전환 비교 (패치 효과 유저 단위)
WITH first_r AS (
  SELECT DISTINCT ON (user_id) user_id, prompt_version, created_at
  FROM readings
  WHERE (emotion_tag IS NULL OR emotion_tag NOT LIKE 'fortune:%')
    AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  ORDER BY user_id, created_at ASC
),
bal AS (
  SELECT user_id, (total_spent>0 AND balance<10) AS reached FROM star_balances
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
pay AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status='completed') AS paid_cnt,
    COALESCE(SUM(amount_won) FILTER (WHERE status='completed'),0) AS rev_won
  FROM payments
  WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
  GROUP BY user_id
)
SELECT
  COALESCE(f.prompt_version,'(null)') AS first_version,
  COUNT(*) AS users,
  COUNT(*) FILTER (WHERE COALESCE(b.reached,false)) AS reached,
  COUNT(*) FILTER (WHERE COALESCE(p.paid_cnt,0)>=1) AS converted,
  COUNT(*) FILTER (WHERE COALESCE(p.paid_cnt,0)>=2) AS repaid,
  COALESCE(SUM(p.rev_won),0) AS revenue_won
FROM first_r f
LEFT JOIN bal b ON b.user_id = f.user_id
LEFT JOIN pay p ON p.user_id = f.user_id
GROUP BY COALESCE(f.prompt_version,'(null)')
ORDER BY 1;

-- ============ Q11 (신규) — C2/C3 업셀·추천 계측 ============
-- (a) next_reco 채움율 (C2 이후 리딩)
SELECT
  prompt_version,
  COUNT(*) AS readings,
  COUNT(*) FILTER (WHERE next_reco IS NOT NULL) AS with_reco,
  COUNT(*) FILTER (WHERE next_reco->>'source'='marker') AS reco_marker,
  COUNT(*) FILTER (WHERE next_reco->>'source'='haiku') AS reco_haiku
FROM readings
WHERE (emotion_tag IS NULL OR emotion_tag NOT LIKE 'fortune:%')
  AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
GROUP BY prompt_version ORDER BY 1;

-- (b) 인챗 업셀 구매 (clarifier / extend)
SELECT source, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users, SUM(amount) AS stars
FROM star_transactions
WHERE type='spend' AND source IN ('clarifier','extend')
  AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
GROUP BY source;

-- (c) 이어가기/추천 전환 (previous_reading_id 자식 리딩)
SELECT consultation_type, COALESCE(continuation_mode,'(fresh/none)') AS mode,
  COUNT(*) AS n, COUNT(DISTINCT user_id) AS users
FROM readings
WHERE previous_reading_id IS NOT NULL
  AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
GROUP BY consultation_type, continuation_mode ORDER BY n DESC;

-- ============ Q12 (신규) — 일별 결제 타임라인 (패치 경계 겹쳐보기) ============
SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS d,
  COUNT(*) FILTER (WHERE status='completed') AS paid_n,
  COALESCE(SUM(amount_won) FILTER (WHERE status='completed'),0) AS rev_won,
  COUNT(DISTINCT user_id) FILTER (WHERE status='completed') AS payers
FROM payments
WHERE left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
GROUP BY 1 ORDER BY 1;

-- ============ Q6 — 정성 덤프 (신규 코호트만: C1~C3 이후 리딩, 민감 제외) ============
WITH reached AS (
  SELECT user_id FROM star_balances
  WHERE total_spent > 0 AND balance < 10
    AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
),
conv AS (
  SELECT DISTINCT user_id FROM payments
  WHERE status='completed' AND left(user_id::text,8) NOT IN ('9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0')
)
SELECT
  (r.user_id IN (SELECT user_id FROM conv)) AS converted,
  r.user_id, r.id AS reading_id,
  r.consultation_type, r.saju_product, r.emotion_tag,
  r.continuation_mode, r.prompt_version, r.result_viewed_at, r.question,
  r.next_reco, r.extra_turns, r.clarifier_count,
  m.role, m.content, m.created_at
FROM readings r
JOIN reached rc ON rc.user_id = r.user_id
LEFT JOIN messages m ON m.reading_id = r.id
WHERE (r.emotion_tag IS NULL OR r.emotion_tag NOT LIKE 'fortune:%')
  AND r.has_sensitive = false
  AND r.prompt_version LIKE '2026-07-13%'
ORDER BY converted, r.user_id, r.created_at, m.created_at;
