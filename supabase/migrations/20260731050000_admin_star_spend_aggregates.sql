-- 별 소모 집계 RPC (2026-07-31) — buildStarSpendBreakdown + attributeFreeSpend 이식
--
-- 왜: /admin 과 /admin/analytics(products) 가 star_transactions 원본을 `.limit(100000)` 으로
-- 끌어와 앱에서 분류·귀속한다. Supabase `Max rows` 가 그 limit 을 조용히 덮어쓴다.
-- 실측(2026-07-31): products 쪽 원장 **1,441행** = 남아 있던 쿼리 중 최대. 대시보드 쪽은 45행
-- (창이 2일이라 작다 — 두 화면이 같은 코드를 쓰지만 창 크기가 달라 규모가 32배 차이난다).
--
-- 🔴 이 숫자는 손익 분석의 입력값이다(기여마진·무료별 원가). 이식본은 현행 JS 와 **행 단위로
--    완전히 일치**해야 채택한다 — 검증은 prod 원본을 받아 JS 를 로컬 실행한 결과와 diff.
--
-- ⚠️ 이식 중 발견한 LIKE 함정 2건 — 둘 다 `_` 가 LIKE 의 **단일문자 와일드카드**라서 생긴다:
--    · JS `s.startsWith("fortune_refund")` 를 `LIKE 'fortune_refund%'` 로 옮기면 'fortuneXrefund'
--      같은 값도 매치된다 → `left(s, 14) = 'fortune_refund'` 로 못박는다.
--    · JS `src.startsWith("fortune_")` 도 같은 이유로 `left(s, 8) = 'fortune_'`.
--    현재 데이터에 그런 값은 없지만 source 는 자유 문자열이라 구조적으로 들어올 수 있다.

-- ── 무료 별 귀속 (free-first FIFO) ──
-- 유저별 전체 원장을 시간순으로 걸으며 (freePool, freeUsed) 두 상태를 갱신하는 **순차 상태
-- 기계**라 윈도우 함수로는 표현이 안 된다 → 재귀 CTE 로 rn 을 따라 한 행씩 전이시킨다.
-- 규칙(현행 attributeFreeSpend 와 1:1):
--   charge + 환불소스 → restore = min(amount, freeUsed); pool += restore; used -= restore
--   charge + source <> 'pg' → pool += amount        (환불 판정이 **먼저**다 — 순서 중요)
--   charge + source =  'pg' → 변화 없음 (유료 충전은 무료 풀에 안 들어간다)
--   spend                   → free = min(amount, pool); pool -= free; used += free
-- ⚠️ 정렬에 `id` 타이브레이커를 넣었다. 현행 JS 는 `created_at` 만으로 정렬해 **동시각이면
--    비결정적**이었다(재현 불가능한 동작). 2026-07-31 실측 동시각 타이 0건이라 값 변화는 없다.
CREATE OR REPLACE FUNCTION admin_star_free_attribution(p_users UUID[])
RETURNS TABLE (tx_id UUID, free_stars INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE ordered AS (
    SELECT l.user_id AS user_id, l.id AS id, l.type AS type, l.amount AS amount,
           l.source AS source,
           row_number() OVER (PARTITION BY l.user_id ORDER BY l.created_at, l.id) AS rn
    FROM star_transactions l
    WHERE l.user_id = ANY(p_users)
  ), walk AS (
    -- 시작 상태 (pool=0, used=0) 에서 첫 행을 전이시킨 결과
    SELECT o.user_id AS user_id, o.id AS id, o.rn AS rn,
           CASE WHEN o.type = 'charge'
                 AND left(o.source, 14) <> 'fortune_refund'
                 AND o.source <> 'pg'
                THEN o.amount ELSE 0 END AS pool,
           0 AS used,
           0 AS free
    FROM ordered o WHERE o.rn = 1
    UNION ALL
    SELECT o.user_id, o.id, o.rn,
           CASE WHEN o.type = 'charge' AND left(o.source, 14) = 'fortune_refund'
                  THEN w.pool + least(o.amount, w.used)
                WHEN o.type = 'charge' AND o.source <> 'pg'
                  THEN w.pool + o.amount
                WHEN o.type = 'spend'
                  THEN w.pool - least(o.amount, w.pool)
                ELSE w.pool END,
           CASE WHEN o.type = 'charge' AND left(o.source, 14) = 'fortune_refund'
                  THEN w.used - least(o.amount, w.used)
                WHEN o.type = 'spend'
                  THEN w.used + least(o.amount, w.pool)
                ELSE w.used END,
           CASE WHEN o.type = 'spend' THEN least(o.amount, w.pool) ELSE 0 END
    FROM walk w
    JOIN ordered o ON o.user_id = w.user_id AND o.rn = w.rn + 1
  )
  -- 무료 몫 0 은 기록하지 않는다(현행 `if (free > 0)` 와 동치)
  SELECT w.id, w.free FROM walk w WHERE w.free > 0;
$$;

-- ── 별 소모 분류 + 집계 ──
-- 분류 사다리는 현행 buildStarSpendBreakdown 과 **순서까지** 같아야 한다. 순서가 곧 우선순위다:
--   1) 비상품 제외 (충전·보너스·수동조정·환불)
--   2) source 특수 케이스 — reading_id 유무와 무관하게 source 가 권위
--      · clarifier/extend 는 reading_id 가 있어도 종목 조인이 아니라 '업셀'로 뺀다
--        (product = "src|출처" — 출처는 업셀이 발생한 대화의 감정 태그)
--      · 인-스레드 스킬(compat·checkin·deep_feelings)은 reading_id 가 스레드 본체(skill_key=null)
--        라 조인만으론 '스레드 대화'로 뭉개진다 → source 로 종목을 살린다
--   3) reading 조인 (연애 → 운세 → 대화상담 순)
--   4) reading 없음 → source 폴백
-- 🔴 운세 판정은 **유효 키 검사**다(fortuneTypeFromTag 와 동치). prefix 만 보면 'fortune:오타'
--    에서 앱과 갈린다.
CREATE OR REPLACE FUNCTION admin_star_spend_breakdown(
  p_since TIMESTAMPTZ, p_until TIMESTAMPTZ, p_exclude UUID[], p_fortune_types TEXT[]
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

-- ── 권한: service_role 전용 ──
REVOKE EXECUTE ON FUNCTION admin_star_free_attribution(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_star_spend_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_star_free_attribution(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_star_spend_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], TEXT[]) TO service_role;
