-- admin_layer1_pnl — 1층 손익의 일별 원시행. 매출·광고비·API원가 3소스를 KST 날짜축에 맞춘다.
--
-- 🔴 왜 일별 행을 주고 롤링을 앱에서 하나 — 밴드(P10~P90)는 56개의 7일 롤링 값이 필요하고,
--    그 분위수 계산은 순수 함수여야 유닛 테스트로 잠긴다(lib/admin/band.ts). SQL 안에서 만들면
--    "이 숫자가 왜 이렇게 나왔나"를 테스트로 물을 수 없다. 행 수는 창 일수(≈63)라 cap 무관.
--
-- 🔴 cost_rows 를 같이 주는 이유 — llm_usage 는 2026-09-20 부터 쌓인다. 그 이전 날의 SUM 은
--    0 이지만 그건 "원가가 0원"이 아니라 "기록이 없다"이고, 둘을 구분하지 못하면 1층이
--    적자를 흑자로 위장한다. 행 수가 0 이면 미축적이다.
--
-- ⚠️ 어드민 제외는 payments/llm_usage 에만 건다. ad_spend 는 유저 개념이 없다.
-- ⚠️ payments.user_id 는 탈퇴 시 NULL 로 익명 보존된다 → `(IS NULL OR <> ALL)` 필수.
--    `<> ALL` 만 쓰면 3값 논리로 NULL 행이 통째로 빠져 탈퇴자 매출이 증발한다(2026-08-02 사례).
-- ⚠️ route IS NULL 인 llm_usage 행은 QA·probe 스크립트가 만든 것이다 — 손익에서 뺀다.
CREATE OR REPLACE FUNCTION admin_layer1_pnl(
  p_since TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (
  bucket DATE,
  revenue_won BIGINT,
  ad_spend_won BIGINT,
  api_cost_won NUMERIC,
  cost_rows BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH axis AS (
    -- 데이터가 없는 날도 행이 있어야 롤링 창이 어긋나지 않는다.
    -- `at time zone 'UTC'` 를 빼면 캐스트가 세션 TimeZone 에 좌우된다(AGENTS.md).
    SELECT generate_series(
             (p_since AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date,
             ((now() AT TIME ZONE 'UTC') + INTERVAL '9 hours')::date,
             INTERVAL '1 day'
           )::date AS d
  ), rev AS (
    SELECT (p.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date AS d,
           SUM(p.amount_won)::BIGINT AS won
    FROM payments p
    WHERE p.status = 'completed'
      AND p.created_at >= p_since
      AND (p.user_id IS NULL OR p.user_id <> ALL(p_exclude))
    GROUP BY 1
  ), ad AS (
    -- spend_date 는 이미 KST 날짜다(사용자가 손으로 입력) — 변환하지 않는다.
    SELECT a.spend_date AS d, SUM(a.spend_won)::BIGINT AS won
    FROM ad_spend a
    WHERE a.spend_date >= (p_since AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date
    GROUP BY 1
  ), cost AS (
    SELECT (l.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date AS d,
           -- 단가 미확정 모델은 cost_won 이 NULL 이라 SUM 에서 빠진다(0 아님) — 토큰은 남아 소급 가능.
           COALESCE(SUM(l.cost_won), 0) AS won,
           COUNT(*)::BIGINT AS rows_n
    FROM llm_usage l
    WHERE l.created_at >= p_since
      AND l.route IS NOT NULL
      AND (l.user_id IS NULL OR l.user_id <> ALL(p_exclude))
    GROUP BY 1
  )
  SELECT x.d,
         COALESCE(rev.won, 0)::BIGINT,
         COALESCE(ad.won, 0)::BIGINT,
         COALESCE(cost.won, 0)::NUMERIC,
         COALESCE(cost.rows_n, 0)::BIGINT
  FROM axis x
  LEFT JOIN rev  ON rev.d  = x.d
  LEFT JOIN ad   ON ad.d   = x.d
  LEFT JOIN cost ON cost.d = x.d
  ORDER BY x.d;
$$;

-- AGENTS.md: 새 SECURITY DEFINER RPC 는 PUBLIC·anon·authenticated 셋 다 명시 REVOKE.
REVOKE ALL ON FUNCTION admin_layer1_pnl(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer1_pnl(TIMESTAMPTZ, UUID[]) TO service_role;
