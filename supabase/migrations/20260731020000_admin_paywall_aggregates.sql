-- 어드민 페이월·대시보드 재화 집계 RPC (2026-07-31) — 플랜 C
--
-- 왜: /admin/paywall 5곳 + /admin(재화) 이 `.limit(100000)` 으로 원본 행을 앱으로 끌어온다.
-- Supabase `Max rows` 가 그 limit 을 조용히 덮어써 잘린다 — PostgREST 는 200 + Content-Range 로
-- 응답하고 supabase-js 는 에러로 승격하지 않는다. **이 화면이 2026-07-28 사고의 당사자다**:
-- 상담 완료율을 21% 로 표시했으나 실제는 63.7% 였다.
--
-- ⚠️ 날짜 버킷은 KST 자정 (20260731000000 에서 어드민 전 화면 통일).
--    `at time zone 'UTC'` 를 빼면 캐스트가 세션 TimeZone 에 좌우된다 — 반드시 유지.
-- ⚠️ 본문 컬럼은 전부 별칭 수식한다 — RETURNS TABLE 의 OUT 파라미터가 본문 스코프에 들어와
--    CTE 컬럼과 이름이 겹친다.

-- ── 1. 페이월 요약 (4개 카드) ──
-- 정의(현행 app/admin/paywall/page.tsx 재현):
--   전체 = star_balances 행 수 · 별 사용 = total_spent > 0
--   페이월 도달 = 별 사용 AND balance < p_min_cost (최저 상품가 미만 = 무료로 더 못 봄)
--   결제 전환 = 도달자 중 completed 결제가 1건이라도 있는 유저
-- ⚠️ payments 는 날짜 필터가 없다(평생) — 현행과 동일. 도달 판정도 시점 개념이 없다.
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
    SELECT DISTINCT p.user_id AS user_id FROM payments p WHERE p.status = 'completed'
  )
  SELECT count(*),
         count(*) FILTER (WHERE b.total_spent > 0),
         count(*) FILTER (WHERE b.total_spent > 0 AND b.balance < p_min_cost),
         count(*) FILTER (WHERE b.total_spent > 0 AND b.balance < p_min_cost
                            AND b.user_id IN (SELECT py.user_id FROM payers py))
  FROM b;
$$;

-- ── 2. 페이월 도달·미결제 목록 ──
-- 🔴 p_limit 필수 — 이건 유일하게 **행 수가 데이터량에 비례하는** 반환이다(표시용 목록).
--    RPC 결과도 PostgREST 를 지나므로 상한을 안 박으면 cap 이 그대로 물린다.
--    상한 도달은 앱이 경고로 드러낸다(조용한 절단 금지).
-- ⚠️ 기본값 5000 의 근거: 2026-07-31 실측 **398행**, 증가 약 24명/일 → 약 190일 여유.
--    처음에 500 으로 뒀다가 **4일 만에 잘린다**는 걸 실측에서 발견해 올렸다.
--    근본 해결은 페이지네이션이다(현행도 398행을 한 표에 쏟아붓고 있어 UI 가 이미 버겁다) —
--    상한에 닿기 전에 그쪽으로 가는 게 맞다. 그때까지는 truncated 플래그가 안전망이다.
-- ⚠️ utm 귀속을 **가장 이른 acquisition 행**으로 바꿨다(first-touch). 현행 JS 는
--    `for (const a of acqs) utmMap.set(...)` 라 **ORDER BY 없는 마지막 행이 이긴다** — 즉
--    유저에게 acquisition 행이 2개 이상이면 결과가 비결정적이었다. 재현이 불가능한 동작이라
--    프로젝트 표준인 first-touch(admin_traffic_entry·admin_funnel 와 같은 규칙)로 통일한다.
--    실무 영향: 유저 대부분이 acquisition 행 1개라 값이 바뀌는 경우는 드물다.
CREATE OR REPLACE FUNCTION admin_paywall_unconverted(
  p_exclude UUID[], p_min_cost INT, p_aliases JSONB, p_limit INT DEFAULT 5000
)
RETURNS TABLE (
  user_id UUID, nickname TEXT, created_at TIMESTAMPTZ,
  balance INT, total_spent INT, readings BIGINT, utm TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH reached AS (
    SELECT sb.user_id AS user_id,
           coalesce(sb.balance, 0) AS balance,
           coalesce(sb.total_spent, 0) AS total_spent
    FROM star_balances sb
    WHERE sb.user_id <> ALL(p_exclude)
      AND coalesce(sb.total_spent, 0) > 0
      AND coalesce(sb.balance, 0) < p_min_cost
      AND NOT EXISTS (
        SELECT 1 FROM payments p WHERE p.user_id = sb.user_id AND p.status = 'completed'
      )
  ), ft AS (
    SELECT a.user_id AS user_id,
           (array_remove(array_agg(a.utm_content ORDER BY a.created_at, a.id), NULL))[1] AS first_utm
    FROM user_acquisition a
    WHERE a.user_id IN (SELECT r.user_id FROM reached r)
    GROUP BY a.user_id
  )
  SELECT r.user_id,
         u.nickname,
         u.created_at,
         r.balance,
         r.total_spent,
         (SELECT count(*) FROM readings rd WHERE rd.user_id = r.user_id),
         admin_canonical_creative(ft.first_utm, p_aliases)
  FROM reached r
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN ft ON ft.user_id = r.user_id
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT p_limit;
$$;

-- ── 3. 상담 완료 퍼널 (시작 → [END] → 결과 열람) ──
-- 🔴 2026-07-28 사고의 당사자 쿼리를 대체한다. 현행은 messages **본문**을 앱으로 끌어와
--    `.includes("[END]")` 를 돌린다 — 본문이라 행당 무게가 크고 cap 에 가장 먼저 닿는 축이었다.
-- ⚠️ 현행 동작을 그대로 재현한다(고치지 않는다):
--    · 운세 제외는 **유효 키 검사**(fortuneTypeFromTag 와 동치) — prefix 만으로는 'fortune:오타'
--      에서 앱과 어긋난다
--    · consultation_type 필터가 **없다** → 연애 스레드가 분모에 섞인다. 이건 알려진 오염이고
--      (d4 판독: `[END]` 가 원리상 불가한 관계 스레드 29건) 여기서 고치면 고정점 대조가 깨진다.
--      범위 조정은 별건으로 다룰 것.
--    · viewed 는 ended 인 것 중 result_viewed_at 이 있는 것 (ended 를 거치지 않은 열람은 제외)
CREATE OR REPLACE FUNCTION admin_consult_funnel(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_fortune_types TEXT[]
)
RETURNS TABLE (started BIGINT, ended BIGINT, viewed BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH consult AS (
    SELECT rd.id AS id, rd.result_viewed_at AS result_viewed_at
    FROM readings rd
    WHERE rd.created_at >= p_since
      AND rd.user_id <> ALL(p_exclude)
      -- 🔴 SQL 3값 논리 함정 — `emotion_tag IS NULL` 을 반드시 명시해야 한다.
      --    `NOT (NULL LIKE 'fortune:%' AND …)` 는 false 가 아니라 **NULL** 이라 WHERE 가 그 행을
      --    버린다. 앱은 `!fortuneTypeFromTag(null)` = true 로 **포함**하므로 그대로 두면 태그
      --    없는 상담이 통째로 사라진다(2026-07-31 실측: started 664 → 634, 30건 유실).
      --    page_views 의 NOT IN 함정과 같은 계열이다(AGENTS.md 운영 함정).
      AND (rd.emotion_tag IS NULL
           OR NOT (rd.emotion_tag LIKE 'fortune:%'
                   AND substring(rd.emotion_tag FROM 9) = ANY(p_fortune_types)))
  ), flagged AS (
    SELECT c.id AS id,
           c.result_viewed_at AS result_viewed_at,
           EXISTS (
             SELECT 1 FROM messages m
             WHERE m.reading_id = c.id AND m.role = 'assistant' AND m.content LIKE '%[END]%'
           ) AS ended
    FROM consult c
  )
  SELECT count(*),
         count(*) FILTER (WHERE f.ended),
         count(*) FILTER (WHERE f.ended AND f.result_viewed_at IS NOT NULL)
  FROM flagged f;
$$;

-- ── 4. 대시보드 결제 합계 (오늘 / 어제 / 누적) ──
-- 현행 app/admin/page.tsx 는 payments 행을 3번 끌어와 앱에서 reduce 한다.
-- 누적 갈래는 **날짜 필터가 없어** 결제 건수와 1:1 로 자란다 = 스펙이 "다음 천장" 2순위로
-- 지목한 곳. 합계는 반환이 항상 1행이라 cap 개념이 소멸한다.
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
  WHERE p.status = 'completed' AND p.user_id <> ALL(p_exclude);
$$;

-- ── 권한: service_role 전용 (게이트는 페이지/라우트의 requireAdmin·middleware 가 담당) ──
-- AGENTS.md 규칙 — PUBLIC·anon·authenticated 셋 다 명시 회수 + 시그니처 명시.
REVOKE EXECUTE ON FUNCTION admin_paywall_summary(UUID[], INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_paywall_unconverted(UUID[], INT, JSONB, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_consult_funnel(TIMESTAMPTZ, UUID[], TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_dashboard_revenue(UUID[], TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_paywall_summary(UUID[], INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_paywall_unconverted(UUID[], INT, JSONB, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_consult_funnel(TIMESTAMPTZ, UUID[], TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_dashboard_revenue(UUID[], TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
