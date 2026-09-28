-- admin_layer2_retention / admin_free_product_lift — 주 코호트 리텐션과 무료 상품 리프트.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 14
--
-- 🔴 무료 상품의 KPI 는 전환율이 아니라 ①리텐션 리프트 ②경유 가입이다(스펙 §5).
--    2026-08-24 실측에서 무료→결제는 깔때기가 아니라 역인과로 판명됐다.
--
-- 🔴 플랜 SQL 의 `star_map_members.user_id` 는 **없는 컬럼**이었다(2026-09-27 prod 확인:
--    id · map_id · display_name · birth_date · birth_time · relation_type · member_anon_id ·
--    is_host · name_public · compat_visible · created_at). check_function_bodies=on 이라
--    그대로 뒀으면 CREATE 단계에서 죽고 **파일 전체가 실패**했을 것이다.
--    → 별자리 접촉자는 `star_maps.owner_user_id` 로 잡는다. 근거:
--      ① 멤버 행은 호스트가 **손으로 적어 넣은 타인**(친구·가족)이라 계정이 아니다 —
--         user_id 로 이어지는 유일한 컬럼이 star_maps.owner_user_id 다.
--      ② map_id 조인이 필요 없다. 2026-09-27 prod: 맵 18개 · owner 18명 · 익명 전용 맵 0 ·
--         멤버 있는 맵 18 → 조인해도 같은 18명이다. 조인을 빼면 **멤버를 아직 안 넣은 맵**의
--         주인도 접촉자로 잡히는데, 그게 맞다(맵을 만든 것 자체가 무료 상품 사용이다).

-- ── 주 단위 가입 코호트 × 1~4주차 재방문 ──────────────────────────────────────
-- 🔴 **고정 지평이다**(2026-09-27 사용자 결정). 이전 안은 1층과 같은 "가입 후 n일이 지난
--    뒤에도 마지막 방문이 있나"(누적 생존)였는데, 그러면 **오래된 코호트일수록 관측 기간이
--    길어 값이 계속 오른다** — 코호트 표의 존재 이유인 세로 비교가 성립하지 않는다.
--    실측이 그대로 보여줬다: 누적 생존 D7 열이 4.4 → 8.5% 로 **오래된 행일수록 높았는데**,
--    같은 데이터를 고정 창으로 다시 재니 6.9 → 3.8% 로 **방향이 뒤집힌다**. 앞의 상승은
--    리텐션이 아니라 관측 기간이었다.
--    → 각 칸은 **가입 시각 기준 고정 길이 창에 방문이 있었나**를 묻는다. 모든 코호트가 같은
--      길이의 창으로 측정되므로 행끼리 비교할 수 있다.
--
-- 🔴 **1층·3층과 다른 지표가 된다 — 의도된 분리다.** 1층 admin_layer1_flow.d7_return 과
--    3층 roadmap-kpi-snapshot 의 d7_return_pct 는 "7일이 지난 뒤에도 방문 기록이 있나"
--    그대로 두고(배포 전 고정한 정의라 바꾸면 베이스라인 비교가 불가능하다) **여기만** 고정
--    창으로 간다. 이 리포엔 선례가 있다 — 결과 열람의 리딩 기준 vs 코호트 기준, 둘 다 정본이고
--    분모가 다르다. 🔴 그래서 호출부 note 가 "같은 값이 아니다"를 반드시 말한다.
--
-- 🔴 창 길이 = **7일 · 구간은 서로 겹치지 않는다**(1~7 / 8~14 / 15~21 / 22~28일차).
--    선택 근거는 실측이다(2026-09-27 prod, 주 코호트 178~289명):
--      · 1일 창("정확히 n일째")이면 분자가 **0~6명** — 한 사람이 0.5%p 를 움직인다. 표가
--        1~3% 의 잡음 바다가 되어 읽을 게 없다.
--      · 3일 창도 0~9명으로 크게 낫지 않다.
--      · 7일 창이면 1주차 분자가 8~15명이고 열 안에서 실제 추세가 보인다.
--    겹치지 않게 자른 이유: 겹치면 D1[1,8) 이 D7[7,14) 을 품어 두 열이 거의 같은 수가 되고,
--    "왜 1 차이나지" 를 묻게 만든다. 붙어 있는 4구간이 "언제 돌아왔나"를 그대로 읽힌다.
--    🔴 라벨도 같이 바꿨다 — 7일 창을 "D1" 이라 부르면 그 이름이 거짓말이다.
--
-- 🔴 **성숙 안 된 칸은 0 이 아니라 NULL 이다.** 3일 된 코호트의 4주차는 **낮은** 게 아니라
--    **아직 없는** 값이고, 화면의 0.0% 는 "쟀더니 아무도 안 왔다"로 읽힌다(Task 12 가 리딩
--    표에서 고친 것과 같은 클래스). 실측으로 확인된 최악은 0.0% 가 아니라 **0.3%** 였다 —
--    반쯤 성숙한 주가 그럴듯한 숫자를 내며 옆의 성숙한 주(2.4%)와 나란히 선다.
--    성숙 기준은 **코호트 주의 마지막 날**이다(주 시작일이 아니다): 분모가 그 주 가입자 전원이라
--    한 명이라도 창이 안 닫혔으면 그 사람은 구조적으로 분자에 못 들어간다.
--    코호트 주는 [wk, wk+7) 이고 k주차 창은 [가입+7k-6, 가입+7k+1) 이므로, 전원의 창이 닫히는
--    시점은 wk + 7 + (7k+1) = **wk + 7k + 8**. 그래서 임계가
--    1주차=wk+15 · 2주차=wk+22 · 3주차=wk+29 · 4주차=wk+36 이다.
--    (2026-09-27 prod 전수 대조: 8주 × 4칸 32칸 전부 "마지막 멤버의 창이 닫힌 뒤에만 열림" 을
--     만족하고 조기 개방 0건. 임계가 주 끝 기준이라 최대 며칠 보수적으로 늦게 열린다.)
--
-- ⚠️ 코호트 창은 **주 경계에 맞춘다**(now() - N weeks 가 아니다) — 롤링으로 자르면 가장 오래된
--    행이 주의 꼬리만 담은 반쪽 코호트가 된다(실측 22명, 옆 주들은 180~290명). 같은 표 안에서
--    분모의 성격이 다른 행은 나란히 읽을 수 없다.
-- ⚠️ pv 는 page_views 에 **달력 창을 걸지 않는다** — 창은 사람마다 자기 가입 시각 기준이다.
--    is_bot 만 거른다.
-- ⚠️ 반환 컬럼 이름이 d1/d3/d7/d14/d28 → w1~w4 로 바뀌므로 CREATE OR REPLACE 만으로는
--    기존 함수를 못 덮는다("cannot change return type"). 이 파일은 아직 어느 DB 에도 적용된
--    적이 없지만, 한 번이라도 먼저 적용된 환경이 있으면 **파일 전체가 실패**한다 — DROP 이 그
--    실패 경로를 없앤다(AGENTS.md: 함수 하나가 죽으면 마이그레이션 파일이 통째로 죽는다).
DROP FUNCTION IF EXISTS admin_layer2_retention(INT, UUID[]);

CREATE OR REPLACE FUNCTION admin_layer2_retention(
  p_weeks INT,
  p_exclude UUID[]
)
RETURNS TABLE (cohort_week DATE, users BIGINT, w1 BIGINT, w2 BIGINT, w3 BIGINT, w4 BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH k AS (
    -- KST 벽시계. `at time zone 'UTC'` 를 빼면 캐스트가 세션 TimeZone 에 좌우된다(AGENTS.md).
    SELECT (now() AT TIME ZONE 'UTC' + INTERVAL '9 hours') AS now_kst
  ), b AS (
    SELECT (date_trunc('week', k.now_kst)::date - (p_weeks - 1) * 7) AS first_wk FROM k
  ), coh AS (
    SELECT u.id, u.created_at,
           date_trunc('week', (u.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours'))::date AS wk
    FROM users u, b
    WHERE (u.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours') >= b.first_wk::timestamp
      AND u.id <> ALL(p_exclude)
  ), pv AS (
    SELECT p.user_id, p.created_at
    FROM page_views p
    JOIN coh ON coh.id = p.user_id
    WHERE NOT COALESCE(p.is_bot, false)
  ), hit AS (
    -- 사람 단위로 "그 구간에 한 번이라도 왔나". 방문이 아예 없는 사람은 bool_or 가 NULL 을
    -- 주고 아래 FILTER 가 참이 아닌 것으로 세므로 분자에서 자연히 빠진다.
    SELECT c.wk, c.id,
           bool_or(p.created_at >= c.created_at + INTERVAL  '1 day' AND p.created_at < c.created_at + INTERVAL  '8 day') AS v1,
           bool_or(p.created_at >= c.created_at + INTERVAL  '8 day' AND p.created_at < c.created_at + INTERVAL '15 day') AS v2,
           bool_or(p.created_at >= c.created_at + INTERVAL '15 day' AND p.created_at < c.created_at + INTERVAL '22 day') AS v3,
           bool_or(p.created_at >= c.created_at + INTERVAL '22 day' AND p.created_at < c.created_at + INTERVAL '29 day') AS v4
    FROM coh c
    LEFT JOIN pv p ON p.user_id = c.id
    GROUP BY c.wk, c.id
  ), agg AS (
    -- h. 수식은 **지금은 막는 게 없다** — hit 의 컬럼은 wk·id·v1~v4 라 출력 파라미터
    -- (cohort_week·users·w1~w4)와 겹치지 않는다. 컬럼 이름이 바뀌어 겹치는 날을 대비한
    -- 습관으로만 남긴다(무해하다). 실제 겹침은 이미 적용된 admin_layer1_flow 가 갖고 있고
    -- (FROM readings + 출력 readings) 문제없이 돈다 — 관계 참조는 파라미터로 해석되지 않는다.
    SELECT h.wk,
           COUNT(*)::BIGINT AS users,
           COUNT(*) FILTER (WHERE h.v1)::BIGINT AS v1,
           COUNT(*) FILTER (WHERE h.v2)::BIGINT AS v2,
           COUNT(*) FILTER (WHERE h.v3)::BIGINT AS v3,
           COUNT(*) FILTER (WHERE h.v4)::BIGINT AS v4
    FROM hit h
    GROUP BY h.wk
  )
  SELECT a.wk, a.users,
         CASE WHEN k.now_kst >= (a.wk + 15)::timestamp THEN a.v1 END,
         CASE WHEN k.now_kst >= (a.wk + 22)::timestamp THEN a.v2 END,
         CASE WHEN k.now_kst >= (a.wk + 29)::timestamp THEN a.v3 END,
         CASE WHEN k.now_kst >= (a.wk + 36)::timestamp THEN a.v4 END
  FROM agg a CROSS JOIN k
  ORDER BY a.wk DESC;
$$;

REVOKE ALL ON FUNCTION admin_layer2_retention(INT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_retention(INT, UUID[]) TO service_role;

-- ── 무료 상품 접촉자 vs 비접촉자의 방문일수 ──────────────────────────────────
-- 접촉 시각은 상품마다 테이블이 다르다.
-- ⚠️ 인과가 아니다 — 무료 상품을 쓰는 사람이 원래 더 오래 남는 사람일 수 있다(선택 편향).
--    "리프트"라는 말이 인과를 암시하므로 호출부가 반드시 이 한계를 적는다.
--
-- 🔴 `NOT IN` 을 쓰지 않는다. touched_users 에 NULL 이 한 줄이라도 섞이면 3값 논리로 **전체가
--    빈 결과**가 된다. 각 갈래에 IS NOT NULL 을 걸어도 그건 "지금 안 샌다"일 뿐이라, 구조로도
--    막히게 LEFT JOIN 으로 뒤집었다(NULL 은 어떤 행과도 매칭되지 않아 자연히 비접촉으로 떨어진다).
--    2026-09-27 카나리아: touched 에 NULL 1행 → NOT IN 0행 / NOT EXISTS 1행 / LEFT JOIN 1행.
--
-- ⚠️ byeolmaru 갈래는 `byeolmaru_subscriptions` 를 참조한다 — prod 엔 아직 테이블이 없지만
--    이 파일보다 번호가 낮은 20260904100000 이 같은 머지에서 **먼저** 적용돼 생성된다.
--    (Supabase Git sync 는 CLI db push 와 달리 낮은 번호를 거부하지 않는다 — 플랜 §실행규율.)
CREATE OR REPLACE FUNCTION admin_free_product_lift(
  p_product TEXT,
  p_exclude UUID[]
)
RETURNS TABLE (touched BIGINT, touched_avg_days NUMERIC, untouched BIGINT, untouched_avg_days NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH touched_users AS (
    SELECT DISTINCT s.owner_user_id AS user_id
    FROM star_maps s
    WHERE p_product = 'byeoljari' AND s.owner_user_id IS NOT NULL
    UNION
    SELECT DISTINCT e.user_id
    FROM ui_events e
    WHERE p_product = 'saju_mbti' AND e.event = 'saju_mbti_completed' AND e.user_id IS NOT NULL
    UNION
    SELECT DISTINCT bs.user_id
    FROM byeolmaru_subscriptions bs
    WHERE p_product = 'byeolmaru' AND bs.user_id IS NOT NULL
  ), vis AS (
    SELECT pv.user_id,
           COUNT(DISTINCT (pv.created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date) AS days
    FROM page_views pv
    WHERE pv.user_id IS NOT NULL
      AND NOT COALESCE(pv.is_bot, false)
      AND pv.user_id <> ALL(p_exclude)
    GROUP BY 1
  )
  -- 접촉자가 0 명이면 AVG 가 NULL 로 나온다(0 이 아니다) — 호출부가 "—" 로 그린다.
  SELECT
    COUNT(*) FILTER (WHERE t.user_id IS NOT NULL)::BIGINT,
    ROUND(AVG(v.days) FILTER (WHERE t.user_id IS NOT NULL), 2),
    COUNT(*) FILTER (WHERE t.user_id IS NULL)::BIGINT,
    ROUND(AVG(v.days) FILTER (WHERE t.user_id IS NULL), 2)
  FROM vis v
  LEFT JOIN touched_users t ON t.user_id = v.user_id;
$$;

REVOKE ALL ON FUNCTION admin_free_product_lift(TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_free_product_lift(TEXT, UUID[]) TO service_role;
