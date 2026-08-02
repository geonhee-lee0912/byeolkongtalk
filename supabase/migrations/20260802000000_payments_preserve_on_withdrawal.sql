-- 20260802000000_payments_preserve_on_withdrawal.sql
-- 탈퇴 유저 매출 보존 — payments 를 CASCADE 삭제 대신 익명화(user_id SET NULL).
--
-- 문제: 탈퇴(users DELETE)가 payments 를 ON DELETE CASCADE 로 물리 삭제해 매출 SUM 에서
--   영구히 사라졌다. 2026-08-02 실측 — 토스 실결제 12,700원/취소 0건인데 어드민 매출 6,800원.
--   오늘 결제 후 탈퇴한 유저의 5,900원이 증발한 것.
--   설계: docs/superpowers/specs/2026-08-02-payments-preserve-on-withdrawal-design.md
--
-- 🔴 핵심: FK 를 SET NULL 로 바꾸는 것만으로는 매출이 안 살아난다. 매출 SUM 들이
--   `user_id <> ALL(p_exclude)` 를 쓰는데 SQL 3값 논리에서 `NULL <> ALL(...)` = NULL(→ WHERE 탈락).
--   그래서 익명화(1) + 매출 SUM 3곳의 NULL 포함(2) 이 반드시 세트다.
--   (AGENTS.md "page_views 어드민 제외 필터" 의 NULL 3값 논리 함정과 동형.)
--
-- ⚠️ 아래 4개 함수는 기존 본문을 그대로 복사하고 payments 필터만 바꿨다 — CREATE OR REPLACE 는
--   ACL 을 유지하므로 REVOKE/GRANT 재실행은 불필요(권한은 20260731010000·020000 에서 확정됨).

-- ── 1. 스키마: payments 를 탈퇴 시 익명 보존 ──
-- user_id 를 nullable 로, FK 를 CASCADE → SET NULL. 탈퇴하면 결제행은 남고 user_id 만 NULL 이 된다.
-- 금액·시각·pg_tid·패키지는 보존(개인 식별자만 소멸) — 매출 집계·거래기록 보관에 부합.
ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── 2-a. 대시보드 매출 (오늘/어제/누적) — NULL(익명 탈퇴분) 포함 ──
CREATE OR REPLACE FUNCTION admin_dashboard_revenue(
  p_exclude UUID[], p_today TIMESTAMPTZ, p_yesterday TIMESTAMPTZ
)
RETURNS TABLE (today_won BIGINT, yesterday_won BIGINT, all_won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(p.amount_won) FILTER (WHERE p.created_at >= p_today), 0)::BIGINT,
         coalesce(sum(p.amount_won) FILTER (WHERE p.created_at >= p_yesterday
                                              AND p.created_at < p_today), 0)::BIGINT,
         coalesce(sum(p.amount_won), 0)::BIGINT
  FROM payments p
  WHERE p.status = 'completed' AND (p.user_id IS NULL OR p.user_id <> ALL(p_exclude));
$$;

-- ── 2-b. 트렌드 (가입·리딩·매출) — payments 갈래만 NULL 포함 ──
CREATE OR REPLACE FUNCTION admin_analytics_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, new_users BIGINT, readings BIGINT, revenue_won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.bucket, sum(t.nu)::BIGINT, sum(t.rd)::BIGINT, sum(t.rev)::BIGINT
  FROM (
    SELECT ((created_at AT TIME ZONE 'UTC' + interval '9 hours')::date) AS bucket,
           1 AS nu, 0 AS rd, 0 AS rev
      FROM users
      WHERE created_at >= p_since AND id <> ALL(p_exclude)
    UNION ALL
    SELECT ((created_at AT TIME ZONE 'UTC' + interval '9 hours')::date), 0, 1, 0
      FROM readings
      WHERE created_at >= p_since AND user_id <> ALL(p_exclude)
    UNION ALL
    SELECT ((created_at AT TIME ZONE 'UTC' + interval '9 hours')::date), 0, 0, coalesce(amount_won, 0)
      FROM payments
      WHERE status = 'completed' AND created_at >= p_since
        AND (user_id IS NULL OR user_id <> ALL(p_exclude))
  ) t
  GROUP BY t.bucket ORDER BY t.bucket;
$$;

-- ── 2-c. 상품 분해 — package 갈래(매출)만 NULL 포함. counsel·fortune(readings 기반)은 불변 ──
CREATE OR REPLACE FUNCTION admin_product_breakdown(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_fortune_types TEXT[], p_limit INT DEFAULT 200
)
RETURNS TABLE (
  kind TEXT,
  key1 TEXT,
  key2 TEXT,
  cnt BIGINT,
  paid_cnt BIGINT,
  stars BIGINT,
  revenue_won BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT rd.consultation_type AS consultation_type,
           rd.emotion_tag AS emotion_tag,
           coalesce(rd.stars_spent, 0) AS stars_spent,
           CASE
             WHEN rd.emotion_tag LIKE 'fortune:%'
              AND substring(rd.emotion_tag FROM 9) = ANY(p_fortune_types)
             THEN substring(rd.emotion_tag FROM 9)
             ELSE NULL
           END AS fortune_kind
    FROM readings rd
    WHERE rd.created_at >= p_since
      AND rd.user_id <> ALL(p_exclude)
      AND rd.consultation_type <> 'relationship'
  )
  SELECT * FROM (
    SELECT 'counsel'::TEXT, r.consultation_type, coalesce(r.emotion_tag, '(없음)'),
           count(*), count(*) FILTER (WHERE r.stars_spent > 0),
           sum(r.stars_spent)::BIGINT, NULL::BIGINT
    FROM r WHERE r.fortune_kind IS NULL
    GROUP BY 1, 2, 3
    ORDER BY 4 DESC
    LIMIT p_limit
  ) counsel_top
  UNION ALL
  SELECT 'fortune'::TEXT, r.fortune_kind, NULL::TEXT,
         count(*), count(*) FILTER (WHERE r.stars_spent > 0),
         sum(r.stars_spent)::BIGINT, NULL::BIGINT
  FROM r WHERE r.fortune_kind IS NOT NULL
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT * FROM (
    SELECT 'package'::TEXT, coalesce(p.package_type, '(없음)'), NULL::TEXT,
           count(*), NULL::BIGINT, NULL::BIGINT, sum(coalesce(p.amount_won, 0))::BIGINT
    FROM payments p
    WHERE p.status = 'completed' AND p.created_at >= p_since
      AND (p.user_id IS NULL OR p.user_id <> ALL(p_exclude))
    GROUP BY 1, 2, 3
    ORDER BY 7 DESC
    LIMIT p_limit
  ) package_top;
$$;

-- ── 2-d. 페이월 요약 — payers 는 "살아있는 결제자"여야 하므로 익명(NULL) 결제 제외 ──
-- 실질 영향은 없다(b.user_id 는 star_balances 의 NOT NULL 이라 NULL 과 IN 매칭 불가) — 방어적 명시.
CREATE OR REPLACE FUNCTION admin_paywall_summary(p_exclude UUID[], p_min_cost INT)
RETURNS TABLE (total_users BIGINT, spent_users BIGINT, reached_users BIGINT, converted_users BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT sb.user_id AS user_id,
           coalesce(sb.balance, 0) AS balance,
           coalesce(sb.total_spent, 0) AS total_spent
    FROM star_balances sb
    WHERE sb.user_id <> ALL(p_exclude)
  ), payers AS (
    SELECT DISTINCT p.user_id AS user_id FROM payments p
    WHERE p.status = 'completed' AND p.user_id IS NOT NULL
  )
  SELECT count(*),
         count(*) FILTER (WHERE b.total_spent > 0),
         count(*) FILTER (WHERE b.total_spent > 0 AND b.balance < p_min_cost),
         count(*) FILTER (WHERE b.total_spent > 0 AND b.balance < p_min_cost
                            AND b.user_id IN (SELECT py.user_id FROM payers py))
  FROM b;
$$;
