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

-- ── 주 단위 가입 코호트 × D1/D3/D7/D14/D28 ────────────────────────────────────
-- 🔴 Dn 의 정의는 1층(admin_layer1_flow.d7_return)과 **글자 단위로 같다**:
--    마지막 방문(page_views MAX) 이 가입 + n일 이후인가. 다른 건 코호트 창뿐이다
--    (1층 = 30일 롤링 / 여기 = 주 버킷 8개). 정의가 갈리면 드릴다운이 헤드라인을 반박한다.
--    ⚠️ 이 정의는 "n일 뒤에 **언젠가** 왔나" 라 코호트가 오래될수록 관측 기간이 길어 계속 오른다
--       — 행끼리 세로 비교가 성립하지 않는다(호출부 note 가 이 경고를 낸다). 고정 지평으로
--       바꾸면 1층과 정의가 갈리므로, 바꾸려면 1층·3층을 같이 바꿔야 한다.
--
-- 🔴 **성숙 안 된 칸은 0 이 아니라 NULL 이다.** 플랜 원안은 분모를 전체로 두고 "미성숙 주는
--    낮게 보이는 게 맞다"고 했는데 아니다 — 3일 된 코호트의 D28 은 **낮은** 게 아니라 **아직
--    없는** 값이고, 화면의 0.0% 는 "쟀더니 아무도 안 왔다"로 읽힌다. Task 12 가 리딩 표에서
--    고친 것과 같은 클래스다(못 재는 칸은 "—").
--    성숙 기준은 **코호트 주의 마지막 날**이다(주 시작일이 아니다): 분모가 그 주 가입자 전원이라
--    한 명이라도 n일을 못 채웠으면 그 사람은 구조적으로 분자에 못 들어간다 — 주 시작일 기준으로
--    열면 딱 그만큼 값이 깎인 채 그려진다(1층이 7일 창에서 분모가 비었던 것과 같은 편향).
--    코호트 주는 [wk, wk+7) 이므로 전원이 성숙하는 시점은 wk + 7 + n. 그래서 임계가
--    D1=wk+8 · D3=wk+10 · D7=wk+14 · D14=wk+21 · D28=wk+35 이다.
--    2026-09-27 prod 실측: 최근 주 전칸 NULL · 직전 주 D1/D3 만 · D28 은 08-17 이전 3주만.
--
-- ⚠️ 코호트 창은 **주 경계에 맞춘다**(now() - N weeks 가 아니다) — 롤링으로 자르면 가장 오래된
--    행이 주의 꼬리만 담은 반쪽 코호트가 된다(실측 22명, 옆 주들은 180~290명). 같은 표 안에서
--    분모의 성격이 다른 행은 나란히 읽을 수 없다.
-- ⚠️ vis 는 page_views 에 창 필터를 걸지 않는다 — 리텐션은 "코호트 창 밖에라도 돌아왔나"를
--    묻는 것이라 방문 시각은 창에 갇히면 안 된다(1층 rvisits 와 같은 규약).
CREATE OR REPLACE FUNCTION admin_layer2_retention(
  p_weeks INT,
  p_exclude UUID[]
)
RETURNS TABLE (cohort_week DATE, users BIGINT, d1 BIGINT, d3 BIGINT, d7 BIGINT, d14 BIGINT, d28 BIGINT)
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
  ), vis AS (
    SELECT pv.user_id, MAX(pv.created_at) AS last_at
    FROM page_views pv
    JOIN coh ON coh.id = pv.user_id
    WHERE NOT COALESCE(pv.is_bot, false)
    GROUP BY 1
  ), agg AS (
    SELECT c.wk,
           COUNT(*)::BIGINT AS users,
           COUNT(*) FILTER (WHERE v.last_at >= c.created_at + INTERVAL '1 day')::BIGINT AS d1,
           COUNT(*) FILTER (WHERE v.last_at >= c.created_at + INTERVAL '3 days')::BIGINT AS d3,
           COUNT(*) FILTER (WHERE v.last_at >= c.created_at + INTERVAL '7 days')::BIGINT AS d7,
           COUNT(*) FILTER (WHERE v.last_at >= c.created_at + INTERVAL '14 days')::BIGINT AS d14,
           COUNT(*) FILTER (WHERE v.last_at >= c.created_at + INTERVAL '28 days')::BIGINT AS d28
    FROM coh c
    LEFT JOIN vis v ON v.user_id = c.id
    GROUP BY c.wk
  )
  SELECT a.wk, a.users,
         CASE WHEN k.now_kst >= (a.wk + 8)::timestamp  THEN a.d1  END,
         CASE WHEN k.now_kst >= (a.wk + 10)::timestamp THEN a.d3  END,
         CASE WHEN k.now_kst >= (a.wk + 14)::timestamp THEN a.d7  END,
         CASE WHEN k.now_kst >= (a.wk + 21)::timestamp THEN a.d14 END,
         CASE WHEN k.now_kst >= (a.wk + 35)::timestamp THEN a.d28 END
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
