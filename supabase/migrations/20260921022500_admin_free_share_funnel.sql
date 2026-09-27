-- admin_layer2_signup_mix / admin_free_share_funnel — 가입의 출처와 무료 상품 공유의 획득 기여.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 11
--
-- 🔴 파일 번호가 플랜(20260921022000)과 다르다 — 그 번호는 Task 10 후속이 가져갔다.
--    022000(Task 10 후속)과 023000(Task 12) 사이인 022500 을 써서 적용 순서를 유지한다.
--    (이미 적용된 마이그레이션 파일은 편집하지 않는다 — 재실행이 안 되므로 dev 에는 영영 안
--     들어가고 prod 에만 들어가 스키마가 갈린다. 고칠 게 있으면 새 파일 + CREATE OR REPLACE.)

-- ── 유입 경로별 가입 · 결제 ────────────────────────────────────────────────
-- 오가닉 = user_acquisition 행이 **없는** 가입이다(스펙 §7).
-- ⚠️ LEFT JOIN 이 필수다 — INNER JOIN 하면 오가닉이 통째로 사라진다.
--    행이 불어나지 않는 근거: user_acquisition 의 **PK 가 user_id** 라 유저당 정확히 1행이다
--    (20260705000000, users 와 1:1 write-once). 이 전제가 깨지면 아래 불변식이 먼저 깨진다.
--
-- 🔴 불변식: 같은 (p_since, p_until, p_exclude) 에서 SUM(signups) == admin_layer1_flow.signups.
--    두 함수의 users 필터가 글자 단위로 같아서 성립한다. 어긋나면 1층과 2층이 다른 모수를
--    말하는 것이고, 이 화면의 존재 이유가 무너진다.
--    2026-09-27 prod 30일 창 인라인 대조: 836 == 836 (diff 0).
--
-- ⚠️ payments 에는 창을 걸지 않는다 — 코호트가 **가입일**로 정의되므로 그 사람의 결제는 전부
--    가입 이후다(인과 역전이 구조적으로 불가능). 즉 이 표의 결제는 "그 코호트의 현재까지 누적"
--    이고, 창 안에서 발생한 결제가 아니다. p_exclude 는 코호트에서 이미 걸러 상속된다.
CREATE OR REPLACE FUNCTION admin_layer2_signup_mix(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (source TEXT, signups BIGINT, payers BIGINT, revenue_won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH coh AS (
    SELECT u.id, COALESCE(a.utm_source, '(오가닉·유입기록 없음)') AS src
    FROM users u
    LEFT JOIN user_acquisition a ON a.user_id = u.id
    WHERE u.created_at >= p_since
      AND (p_until IS NULL OR u.created_at < p_until)
      AND u.id <> ALL(p_exclude)   -- users.id 는 PK(NOT NULL) 라 3값 논리 함정이 없다
  ), pay AS (
    SELECT c.src, c.id, SUM(p.amount_won)::BIGINT AS won
    FROM coh c
    JOIN payments p ON p.user_id = c.id AND p.status = 'completed'
    GROUP BY 1, 2
  )
  SELECT c.src,
         COUNT(*)::BIGINT,
         (SELECT COUNT(*) FROM pay WHERE pay.src = c.src)::BIGINT,
         (SELECT COALESCE(SUM(won), 0) FROM pay WHERE pay.src = c.src)::BIGINT
  FROM coh c
  GROUP BY c.src
  ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION admin_layer2_signup_mix(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_signup_mix(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;

-- ── 무료 상품 공유 퍼널 (착지 → 가입 → 결제) ───────────────────────────────
-- 무료 상품 4종을 **같은 정의**로 잰다(스펙 §5).
--
-- 🔴 코호트 판정이 utm 쿠키에 기대지 않는다. `byeolkong_acq` 쿠키는 first-touch 라 30일간
--    덮어쓰지 않아, 광고로 먼저 왔던 사람이 공유링크로 재방문해 가입하면 utm_source='meta' 로
--    기록되고 공유 기여가 은폐된다(§5-3). 그래서 **page_views 착지 → 같은 anon 의 로그인**
--    브리지를 쓴다(MBTI 가 이미 쓰는 기법).
-- 🔴 결제는 **착지 이후 것만** 센다. admin_cohort_payments 가 전 기간을 합해 인과로 읽을 수
--    없었던 결함(§5-1)을 여기서 고친다.
--
-- 🔴 p_bridge_days — 착지 anon 의 로그인을 몇 일까지 그 착지의 결과로 볼 것인가. 상한이 없으면
--    1년 전 별자리 링크로 착지했던 anon 이 오늘 로그인해도 그 상품의 획득으로 잡혀 인과가
--    희석된다(anon 쿠키 수명이 1년이라 그럴 여지가 실제로 크다 — proxy.ts maxAge 365일).
--    기본값을 30일로 잡은 근거: `byeolkong_acq` 쿠키의 수명이 30일이라(components/auth/
--    AuthBootstrap.tsx `max-age=60*60*24*30`) utm 기반 귀속이 이미 쓰는 지평과 같아진다 —
--    두 귀속 방식이 같은 창을 쓰면 나중에 나란히 놓고 대조할 수 있다.
--    ⚠️ 호출부가 값을 넘기는 이유: 화면 note 에 그 일수를 찍어야 하는데, SQL 에 상수로 박으면
--       note 문자열과 **두 곳**이 되어 드리프트한다. 숫자의 단일 원천은 호출부 상수다.
--
-- 🔴 `signed` 는 **착지 이후에 생긴 계정만** 센다(u.created_at >= l.first_touch_at).
--    플랜 원안엔 이 가드가 없어 "이미 있는 계정이 공유 링크를 눌러 들어와 로그인한 것"까지
--    가입으로 셌다 — 이 표가 재려는 건 획득(바이럴)이라 그건 가입이 아니다.
--    2026-09-27 prod 반사실 계측('meta' 90일 창, 표본이 있는 유일한 utm): 1,945 → 1,863
--    (−82, −4.2%). 상한 30일의 효과는 1,948 → 1,945 (−3).
--
-- 🔴 landings 에는 p_exclude 가 안 걸린다(구조적) — 착지는 anon 기준이고 비로그인 착지 행에는
--    user_id 자체가 없다. 분모에만 내부 계정이 섞이는 **비대칭**이라 전환이 실제보다 낮게
--    보인다. 호출부 note 가 이걸 드러낸다(숨기면 숫자를 해석할 수 없다).
CREATE OR REPLACE FUNCTION admin_free_share_funnel(
  p_product TEXT,
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[],
  p_bridge_days INT
)
RETURNS TABLE (landings BIGINT, signups BIGINT, payers BIGINT, revenue_won BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH land AS (
    -- 그 상품 링크로 착지한 anon 과 첫 접촉 시각.
    SELECT pv.anon_id, MIN(pv.created_at) AS first_touch_at
    FROM page_views pv
    WHERE pv.utm_source = p_product
      AND pv.anon_id IS NOT NULL
      AND NOT COALESCE(pv.is_bot, false)
      AND pv.created_at >= p_since
      AND (p_until IS NULL OR pv.created_at < p_until)
    GROUP BY 1
  ), bridged AS (
    -- 같은 anon 이 **착지 후 p_bridge_days 안에** 로그인한 user_id.
    -- users 조인은 INNER 라 pv.user_id IS NULL 행이 알아서 빠진다(3값 논리 함정 없음) —
    -- 그래서 `<> ALL(p_exclude)` 를 맨몸으로 써도 안전하다.
    -- 한 anon 이 여러 계정을 만들 수 있어 DISTINCT 로 접는다.
    SELECT DISTINCT l.anon_id, pv.user_id, l.first_touch_at
    FROM land l
    JOIN page_views pv ON pv.anon_id = l.anon_id
    JOIN users u ON u.id = pv.user_id
    WHERE pv.user_id <> ALL(p_exclude)
      AND pv.created_at >= l.first_touch_at
      AND pv.created_at < l.first_touch_at + make_interval(days => p_bridge_days)
      AND u.created_at >= l.first_touch_at
  ), signed AS (
    -- 한 계정이 여러 anon 으로 착지했으면 **가장 이른** 접촉을 그 계정의 기준 시각으로 삼는다.
    SELECT b.user_id, MIN(b.first_touch_at) AS first_touch_at
    FROM bridged b
    GROUP BY b.user_id
  )
  SELECT (SELECT COUNT(*) FROM land)::BIGINT,
         (SELECT COUNT(*) FROM signed)::BIGINT,
         (SELECT COUNT(*) FROM signed s WHERE EXISTS (
            SELECT 1 FROM payments p
            WHERE p.user_id = s.user_id AND p.status = 'completed'
              AND p.created_at > s.first_touch_at))::BIGINT,
         (SELECT COALESCE(SUM(p.amount_won), 0) FROM signed s
          JOIN payments p ON p.user_id = s.user_id AND p.status = 'completed'
          WHERE p.created_at > s.first_touch_at)::BIGINT;
$$;

REVOKE ALL ON FUNCTION admin_free_share_funnel(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_free_share_funnel(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID[], INT) TO service_role;
