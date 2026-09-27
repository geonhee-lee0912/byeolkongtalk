-- 별 소모 분류 사다리의 폴백 확장 (2026-09-27)
--
-- 문제: `ELSE 'upsell'` 이 매칭 안 된 source 를 전부 삼켰다. dev 전기간 실측(2026-09-27):
--   relationship_slot 1,800별 · relationship_sim 75 · byeolmaru_subscription 20 ·
--   relationship_sim_suggest 10 = **1,905별 전액 오분류**, 진짜 인챗 업셀(clarifier·extend)은 0별.
--   2층 「별 소모」의 '인챗 업셀' 막대가 100% 남의 것이었고, /admin/free/* 는 종목 열에
--   `upsell` 을 원문 그대로 찍고 있었다.
--
-- 🔴 이 변경은 **화면 버킷 수정과 한 세트다.** domain 을 고치기만 하면 새 'byeolmaru' 를
--    받는 버킷이 없어 그 별이 2층에서 **아예 사라진다**(지금은 틀리게나마 잡힌다).
--    같은 커밋의 app/api/admin/layer2/route.ts 가 사주·별마루 버킷과 **잔여 버킷**을 넣는다.
--    잔여 버킷이 이 사고의 재발 방지다 — 사다리의 domain 집합과 화면의 필터 집합이 서로를
--    모른 채 굳는 게 근본 원인이었고(사주 1,949별도 같은 이유로 2층에서 빠져 있었다),
--    잔여가 있으면 다음번엔 조용히 사라지는 대신 '기타'로 **보인다.**
--
-- 본문은 20260829010000 의 함수를 그대로 복제하고 domain CASE 의 4단계(폴백)만 늘렸다.
-- 시그니처·반환형·권한 동일 → CREATE OR REPLACE 로 충분하다(DROP 불필요).
--
-- 검증(dev, 2026-09-27): 적용 전 upsell 1,905별 → 적용 후 upsell 0 · relationship +1,885 ·
-- byeolmaru 20. 다른 domain 합은 불변.

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
             -- 🔴 2026-09-27 신설. 아래 셋은 전부 ELSE 'upsell' 로 떨어지고 있었다 — dev 전기간
             --    실측 1,905별 전액이 오분류였고 **진짜 인챗 업셀(clarifier·extend)은 0별**이었다.
             --    즉 2층 「별 소모」의 '인챗 업셀' 막대는 100% 남의 것이었다.
             --    정답은 lib/admin/product-map.ts 의 labelOfSpendSource 가 이미 선언하고
             --    유닛으로 잠가 뒀다(플랜 B). 그때는 2층 기여만 고쳤고 이 사다리는 남아 있었다.
             -- ⚠️ `_` 는 LIKE 의 와일드카드라 여기서는 left()=로 비교한다(AGENTS.md).
             --    'byeolmaru_'=10자 · 'relationship_'=13자 · 'rel_'=4자.
             WHEN left(w.source, 10) = 'byeolmaru_'    THEN 'byeolmaru'
             WHEN left(w.source, 13) = 'relationship_' THEN 'relationship'
             WHEN left(w.source, 4)  = 'rel_'          THEN 'relationship'
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

-- 권한은 기존 정의에서 이미 service_role 전용으로 잡혀 있지만, 이중 방어로 다시 명시한다
-- (AGENTS.md — 기본 권한이 플랫폼 쪽에서 되돌아갈 수 있고 명시 회수는 싸다).
REVOKE EXECUTE ON FUNCTION admin_star_spend_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[], UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_star_spend_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[], UUID[]) TO service_role;
