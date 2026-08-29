-- 코호트 구매 여정 인프라 (2026-08-29)
-- 1) admin_star_spend_breakdown 을 p_users(nullable) 로 일반화 — 검증된 분류 사다리를
--    복제하지 않고 코호트 스코프. p_users=NULL 이면 기존과 동일(전역). 기존 4-arg 는 DROP
--    (PostgREST 오버로드 모호성 방지) — 기존 호출부(app/admin/page.tsx, products route)는
--    4개 named arg 로 호출하므로 5번째 p_users 는 DEFAULT NULL 로 해소된다.
-- 2) admin_cohort_payments — 코호트의 별 충전(payments) 분해.

DROP FUNCTION IF EXISTS admin_star_spend_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[]);

CREATE OR REPLACE FUNCTION admin_star_spend_breakdown(
  p_since TIMESTAMPTZ, p_until TIMESTAMPTZ, p_exclude UUID[], p_fortune_types TEXT[],
  p_users UUID[] DEFAULT NULL
)
RETURNS TABLE (domain TEXT, product TEXT, cnt BIGINT, stars BIGINT, free_stars BIGINT, users BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH win AS (
    SELECT t.id AS id, t.user_id AS user_id, t.amount AS amount, t.source AS source,
           t.reading_id AS reading_id
    FROM star_transactions t
    WHERE t.type = 'spend'
      AND t.created_at >= p_since
      AND (p_until IS NULL OR t.created_at < p_until)
      AND t.user_id <> ALL(p_exclude)
      AND (p_users IS NULL OR t.user_id = ANY(p_users))
  ), spenders AS (
    SELECT DISTINCT w.user_id AS user_id FROM win w
  ), freemap AS (
    SELECT f.tx_id AS tx_id, f.free_stars AS free_stars
    FROM admin_star_free_attribution(ARRAY(SELECT s.user_id FROM spenders s)) f
  ), classified AS (
    SELECT w.id AS id, w.user_id AS user_id, w.amount AS amount,
           coalesce(fm.free_stars, 0) AS free_stars,
           CASE
             -- 2) source 특수 케이스
             WHEN w.source IN ('clarifier', 'extend')  THEN 'upsell'
             WHEN w.source = 'relationship_pass'       THEN 'relationship'
             WHEN w.source = 'rel_extend'              THEN 'relationship'
             WHEN w.source IN ('rel_skill_verdict','rel_skill_compat','rel_skill_checkin','rel_skill_deep_feelings')
                                                       THEN 'relationship'
             -- 3) reading 조인
             WHEN r.id IS NOT NULL AND (r.relationship_id IS NOT NULL OR r.skill_key IS NOT NULL)
                                                       THEN 'relationship'
             WHEN r.id IS NOT NULL AND r.emotion_tag LIKE 'fortune:%'
                  AND substring(r.emotion_tag FROM 9) = ANY(p_fortune_types)
                                                       THEN 'fortune'
             WHEN r.id IS NOT NULL AND r.consultation_type IN ('saju','tarot')
                                                       THEN r.consultation_type
             WHEN r.id IS NOT NULL                     THEN 'relationship'
             -- 4) reading 없음 → source 폴백
             WHEN left(w.source, 8) = 'fortune_'       THEN 'fortune'
             WHEN w.source = 'tarot_reading'           THEN 'tarot'
             WHEN w.source = 'saju_reading'            THEN 'saju'
             ELSE 'upsell'
           END AS domain,
           CASE
             WHEN w.source IN ('clarifier', 'extend') THEN
               w.source || '|' || CASE WHEN r.id IS NULL THEN '(리딩 유실)'
                                       ELSE coalesce(r.emotion_tag, '(태그 없음)') END
             WHEN w.source = 'relationship_pass' THEN '패스'
             WHEN w.source = 'rel_extend'        THEN '스레드 연장'
             WHEN w.source = 'rel_skill_verdict'        THEN '스킬:verdict'
             WHEN w.source = 'rel_skill_compat'         THEN '스킬:compat'
             WHEN w.source = 'rel_skill_checkin'        THEN '스킬:checkin'
             WHEN w.source = 'rel_skill_deep_feelings'  THEN '스킬:deep_feelings'
             WHEN r.id IS NOT NULL AND (r.relationship_id IS NOT NULL OR r.skill_key IS NOT NULL)
               THEN CASE WHEN r.skill_key IS NOT NULL THEN '스킬:' || r.skill_key ELSE '스레드 대화' END
             WHEN r.id IS NOT NULL AND r.emotion_tag LIKE 'fortune:%'
                  AND substring(r.emotion_tag FROM 9) = ANY(p_fortune_types)
               THEN substring(r.emotion_tag FROM 9)
             WHEN r.id IS NOT NULL AND r.consultation_type IN ('saju','tarot')
               THEN coalesce(r.emotion_tag, '(없음)')
             WHEN r.id IS NOT NULL THEN '스레드 대화'
             WHEN left(w.source, 8) = 'fortune_' THEN substring(w.source FROM 9)
             WHEN w.source = 'tarot_reading' THEN '(리딩 삭제·유실)'
             WHEN w.source = 'saju_reading'  THEN '(리딩 삭제·유실)'
             ELSE w.source
           END AS product
    FROM win w
    LEFT JOIN readings r ON r.id = w.reading_id
    LEFT JOIN freemap fm ON fm.tx_id = w.id
    -- 1) 비상품 제외 (충전·보너스·수동조정 + 운세 환불)
    WHERE w.source NOT IN ('pg','welcome_bonus','first_charge_bonus','admin_adjust')
      AND left(w.source, 14) <> 'fortune_refund'
  )
  SELECT c.domain, c.product,
         count(*), sum(c.amount)::BIGINT, sum(c.free_stars)::BIGINT, count(DISTINCT c.user_id)
  FROM classified c
  GROUP BY c.domain, c.product
  ORDER BY sum(c.amount) DESC;
$$;

-- 코호트 별 충전(payments) 분해. 코호트 스코프라 익명(NULL) 탈퇴분은 의도적으로 제외(스펙 §8).
CREATE OR REPLACE FUNCTION admin_cohort_payments(p_users UUID[])
RETURNS TABLE (package_type TEXT, payers BIGINT, revenue_won BIGINT, stars_given BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(p.package_type, '(없음)'),
         count(DISTINCT p.user_id)::BIGINT,
         sum(p.amount_won)::BIGINT,
         sum(p.stars_given)::BIGINT
  FROM payments p
  WHERE p.status = 'completed' AND p.user_id = ANY(p_users)
  GROUP BY 1
  ORDER BY 3 DESC;
$$;

-- ── 권한: service_role 전용 (5-arg 시그니처 명시) ──
REVOKE EXECUTE ON FUNCTION admin_star_spend_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[], UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_cohort_payments(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_star_spend_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[], UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_cohort_payments(UUID[]) TO service_role;
