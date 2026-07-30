-- 어드민 애널리틱스 집계 RPC (2026-07-31) — 플랜 B
-- 설계 정본: docs/superpowers/specs/2026-07-29-admin-aggregation-rpc-and-visitor-mix-design.md
-- 플랜: docs/superpowers/plans/2026-07-29-admin-rpc-b-analytics.md
--
-- 왜: /admin/analytics 4라우트 + /api/admin/stats 가 `.limit(100000)` 으로 원본 행을 앱으로
-- 끌어온다. Supabase `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어써 잘린다 —
-- PostgREST 는 200 + Content-Range 로 응답하고 supabase-js 는 에러로 승격하지 않는다
-- (2026-07-28 사고: /admin/traffic UV 53% 유실 · /admin/paywall 완료율 21% 표시, 실제 63.7%).
-- 원칙: 집계는 Postgres, 앱은 결과만. 반환 행수가 데이터량과 무관해지면 cap 개념이 소멸한다.
--
-- ⚠️ 날짜 버킷은 **KST 자정**: ((created_at at time zone 'UTC' + interval '9 hours')::date)
--    20260731000000 에서 어드민 전 화면이 자정으로 통일됐다 — 이 파일도 같은 기준이다.
--    (플랜 B 초안은 "traffic 은 오전 10시라 기준이 다르다"고 경고했으나 그 주의는 소멸했다.)
-- 🔴 `at time zone 'UTC'` 를 빼면 timestamptz::date 캐스트가 **세션 TimeZone 에 좌우된다.**
--    JS 쪽 kstDate(lib/admin-time.ts)는 항상 UTC 기준이므로 여기서 UTC 를 못박아 맞춘다.
--    등가성은 lib/admin-time.test.ts 가 지킨다.
--
-- 어드민 제외: 이 테이블들은 user_id 가 NOT NULL 이라 page_views 의 3값 논리 문제가 없다.
-- 현행 앱의 .not("user_id","in",…) 와 동일하게 `<> ALL(p_exclude)` 를 쓴다.

-- ── 별칭 병합 (lib/analytics/creative-alias.ts canonicalCreative 와 1:1) ──
-- trim 하지 않는다 — JS 도 exact-match 다. 빈 문자열·null 은 그대로 통과시키고
-- '(organic)' 폴백은 호출부가 담당한다.
-- ⚠️ 매크로 미치환('{{ad.name}}')은 **접지 않는다** — traffic 의 admin_normalize_entry 와 다르다.
--    현행 JS canonicalCreative 가 안 접으므로 값을 바꾸면 대조가 깨진다(정답지 실측 2건 존재).
CREATE OR REPLACE FUNCTION admin_canonical_creative(p_val TEXT, p_aliases JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_val IS NULL OR p_val = '' THEN p_val
    ELSE coalesce(p_aliases ->> p_val, p_val)
  END;
$$;

-- ── 1. 트렌드 (가입 · 리딩 · 매출) ──
-- 3개 테이블을 union all 로 한 축에 세우고 한 번 group by 한다. 날짜 축 0 채우기는 앱이
-- 계속 담당한다(buildTrends 의 프리필과 같은 이유 — 수집 끊긴 날이 행째로 사라지면 안 된다).
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
      WHERE status = 'completed' AND created_at >= p_since AND user_id <> ALL(p_exclude)
  ) t
  GROUP BY t.bucket ORDER BY t.bucket;
$$;

-- ── 2. 상품 분해 (상담 / 운세 / 패키지) ──
-- p_fortune_types: 유효한 운세 타입 키 배열. 앱의 FORTUNE_CONFIG 에서 주입한다.
-- ⚠️ like 'fortune:%' 만으로 판정하면 'fortune:오타' 를 앱은 상담으로, SQL 은 운세로 분류해
--    조용히 어긋난다(fortuneTypeFromTag 는 접미사가 유효 키일 때만 운세로 본다).
--    2026-07-31 실측으로 무효 태그는 0건이지만, 자유 문자열이라 언제든 생길 수 있어 검사를 유지한다.
-- 연애 스레드(consultation_type='relationship')는 counsel 에서 제외 — 별 소모·연애 메뉴에서 다룬다.
-- 🔴 p_limit — counsel 갈래는 (consultation_type × emotion_tag) 카디널리티에 비례한다.
--    emotion_tag 가 자유 문자열이라 상한이 없다 → RPC 도 PostgREST 를 지나므로 cap 재발 가능.
--    fortune 갈래는 p_fortune_types 길이로 이미 유계라 상한이 필요 없다.
--    상한 도달은 앱이 경고로 드러낸다(조용한 절단 금지).
CREATE OR REPLACE FUNCTION admin_product_breakdown(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_fortune_types TEXT[], p_limit INT DEFAULT 200
)
RETURNS TABLE (
  kind TEXT,           -- 'counsel' | 'fortune' | 'package'
  key1 TEXT,           -- counsel: consultation_type · fortune: 운세타입 · package: package_type
  key2 TEXT,           -- counsel: emotion_tag · 그 외 NULL
  cnt BIGINT,
  paid_cnt BIGINT,     -- counsel·fortune: stars_spent>0 인 건수 · package: NULL
  stars BIGINT,        -- counsel·fortune 만
  revenue_won BIGINT   -- package 만
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
  -- counsel: 상한을 박고 cnt 내림차순으로 상위만 (앱의 count desc 정렬과 같은 기준이라
  -- 잘려도 "상위 N" 이 되어 순서가 뒤바뀌지 않는다)
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
  -- fortune: p_fortune_types 로 이미 유계 (상한 불필요)
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
    WHERE p.status = 'completed' AND p.created_at >= p_since AND p.user_id <> ALL(p_exclude)
    GROUP BY 1, 2, 3
    ORDER BY 7 DESC
    LIMIT p_limit
  ) package_top;
$$;

-- ── 3. 연애 패스 집계 (products 화면의 인라인 passAgg 를 대체) ──
CREATE OR REPLACE FUNCTION admin_pass_breakdown(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (pass_kind TEXT, cnt BIGINT, stars BIGINT, buyers BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rp.kind, count(*), sum(coalesce(rp.stars_spent, 0))::BIGINT, count(DISTINCT rp.user_id)
  FROM relationship_passes rp
  WHERE rp.created_at >= p_since AND rp.user_id <> ALL(p_exclude)
  GROUP BY rp.kind ORDER BY rp.kind;
$$;

-- ── 4. 소재별 퍼널 ──
-- 그룹 모집단이 두 갈래다 (현행 buildFunnel 과 동일):
--   ① 창 안 user_acquisition 행이 있는 유저 → 그 utm_content(별칭 병합) 또는 '(organic)'
--   ② 창 안 가입 유저 중 ①에 없는 유저 → '(추적 안 됨)'
-- ⚠️ ①은 users.created_at 을 보지 않는다 — 창 전에 가입한 유저도 acquisition 행이 창 안이면
--    포함된다. 현행 동작이므로 유지한다(users 로 INNER JOIN 하면 값이 달라진다).
-- readings·payments 는 날짜 필터가 없다(평생) — 현행 F3·F4 와 동일.
-- ad_spend 는 어드민 제외를 걸지 않는다(지출은 유저와 무관) — 현행 F5 와 동일.
-- 🔴 p_limit 필수 — 반환 행수가 소재 카디널리티에 비례한다. RPC 결과도 PostgREST 를 지나므로
--    `Max rows` cap 이 그대로 적용된다.
CREATE OR REPLACE FUNCTION admin_funnel(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_aliases JSONB, p_limit INT DEFAULT 200
)
RETURNS TABLE (
  creative TEXT, signups BIGINT, tried BIGINT, first_paid BIGINT, repaid BIGINT,
  signup_to_paid_pct NUMERIC, revenue_won BIGINT, spend_won BIGINT, cac BIGINT, roas NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH tracked AS (
    SELECT a.user_id AS user_id,
           coalesce(nullif(admin_canonical_creative(a.utm_content, p_aliases), ''), '(organic)') AS creative
    FROM user_acquisition a
    WHERE a.created_at >= p_since AND a.user_id <> ALL(p_exclude)
  ), untracked AS (
    SELECT u.id AS user_id, '(추적 안 됨)'::TEXT AS creative
    FROM users u
    WHERE u.created_at >= p_since AND u.id <> ALL(p_exclude)
      AND NOT EXISTS (
        SELECT 1 FROM user_acquisition a2
        WHERE a2.user_id = u.id AND a2.created_at >= p_since
      )
  ), grp AS (
    SELECT DISTINCT g.creative AS creative, g.user_id AS user_id FROM (
      SELECT t.user_id, t.creative FROM tracked t
      UNION ALL
      SELECT ut.user_id, ut.creative FROM untracked ut
    ) g
  ), per_user AS (
    SELECT g.creative AS creative, g.user_id AS user_id,
           EXISTS (SELECT 1 FROM readings r WHERE r.user_id = g.user_id) AS tried,
           (SELECT count(*) FROM payments p
             WHERE p.user_id = g.user_id AND p.status = 'completed') AS paid_n,
           (SELECT coalesce(sum(p.amount_won), 0) FROM payments p
             WHERE p.user_id = g.user_id AND p.status = 'completed') AS rev
    FROM grp g
  ), agg AS (
    SELECT pu.creative AS creative,
           count(*)::BIGINT AS signups,
           count(*) FILTER (WHERE pu.tried)::BIGINT AS tried,
           count(*) FILTER (WHERE pu.paid_n >= 1)::BIGINT AS first_paid,
           count(*) FILTER (WHERE pu.paid_n >= 2)::BIGINT AS repaid,
           sum(pu.rev)::BIGINT AS revenue_won
    FROM per_user pu GROUP BY pu.creative
  ), spend AS (
    SELECT s0.creative_key AS creative_key, sum(s0.spend_won)::BIGINT AS spend_won
    FROM ad_spend s0
    WHERE s0.spend_date >= ((p_since AT TIME ZONE 'UTC' + interval '9 hours')::date)
    GROUP BY s0.creative_key
  )
  SELECT a.creative, a.signups, a.tried, a.first_paid, a.repaid,
         round((a.first_paid::NUMERIC * 100) / nullif(a.signups, 0), 1),
         a.revenue_won,
         -- organic 은 지출 귀속이 불가능하므로 강제 NULL (현행과 동일)
         CASE WHEN a.creative = '(organic)' THEN NULL ELSE s.spend_won END,
         CASE WHEN a.creative = '(organic)' OR s.spend_won IS NULL THEN NULL
              ELSE round(s.spend_won::NUMERIC / nullif(a.signups, 0))::BIGINT END,
         CASE WHEN a.creative = '(organic)' OR s.spend_won IS NULL OR s.spend_won = 0 THEN NULL
              ELSE round(a.revenue_won::NUMERIC / s.spend_won, 2) END
  FROM agg a LEFT JOIN spend s ON s.creative_key = a.creative
  -- (organic) → (추적 안 됨) 순으로 맨 아래, 나머지는 가입 내림차순 (현행 rank 함수와 동일)
  ORDER BY (CASE a.creative WHEN '(추적 안 됨)' THEN 2 WHEN '(organic)' THEN 1 ELSE 0 END),
           a.signups DESC
  LIMIT p_limit;
$$;

-- ── 5. 코호트 ──
-- ⚠️ 비표준 규칙 2개. 표준 코호트 SQL 템플릿을 쓰면 둘 다 틀린다:
--  ① 주차 인덱스가 코호트 주 시작이 아니라 **개인 가입 시각 기준** floor(경과일/7).
--     같은 코호트 안에서 유저별 오프셋이 다르다.
--  ② 리텐션 d1/d7/d30 이 "가입 후 N일 **이후** 활동" **누적** 정의(≥ 조건, 윈도우 아님)
--     → d1 ⊇ d7 ⊇ d30. 고전적 D1 리텐션이 아니다.
-- 코호트 버킷은 KST 월요일 = date_trunc('week', … + 9h) (Postgres 주 시작 = 월요일).
-- payments·readings 는 날짜 필터가 없다(평생) — 현행 G2·G3 와 동일.
CREATE OR REPLACE FUNCTION admin_cohorts(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_weeks INT DEFAULT 12
)
RETURNS TABLE (
  week_start DATE, cohort_size BIGINT, cum_revenue_per_user BIGINT[],
  d1 NUMERIC, d7 NUMERIC, d30 NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    SELECT us.id AS id, us.created_at AS created_at,
           date_trunc('week', us.created_at AT TIME ZONE 'UTC' + interval '9 hours')::date AS week_start
    FROM users us WHERE us.created_at >= p_since AND us.id <> ALL(p_exclude)
  ), sizes AS (
    SELECT u.week_start AS week_start, count(*)::BIGINT AS cohort_size FROM u GROUP BY 1
  ), rev AS (
    SELECT u.week_start AS week_start,
           greatest(0, floor(extract(epoch FROM (p.created_at - u.created_at)) / 86400 / 7))::INT AS wi,
           sum(coalesce(p.amount_won, 0))::BIGINT AS amt
    FROM u JOIN payments p ON p.user_id = u.id AND p.status = 'completed'
    GROUP BY 1, 2
  ), series AS (
    SELECT s.week_start AS week_start, gs.wi AS wi FROM sizes s
    CROSS JOIN generate_series(0, p_weeks - 1) AS gs(wi)
  ), cum AS (
    -- wi >= p_weeks 인 결제는 series 에 없어 자동 제외된다 (현행 `if (wi >= weeks) continue`)
    SELECT se.week_start AS week_start, se.wi AS wi,
           sum(coalesce(r.amt, 0)) OVER (PARTITION BY se.week_start ORDER BY se.wi) AS running
    FROM series se LEFT JOIN rev r ON r.week_start = se.week_start AND r.wi = se.wi
  ), cum_arr AS (
    SELECT c.week_start AS week_start,
           array_agg(round(c.running::NUMERIC / s.cohort_size)::BIGINT ORDER BY c.wi) AS cum_revenue_per_user
    FROM cum c JOIN sizes s ON s.week_start = c.week_start
    GROUP BY c.week_start
  ), act AS (
    SELECT u.week_start AS week_start, r.user_id AS user_id,
           floor(extract(epoch FROM (r.created_at - u.created_at)) / 86400) AS d
    FROM u JOIN readings r ON r.user_id = u.id
  ), ret AS (
    SELECT a.week_start AS week_start,
           count(DISTINCT a.user_id) FILTER (WHERE a.d >= 1) AS d1,
           count(DISTINCT a.user_id) FILTER (WHERE a.d >= 7) AS d7,
           count(DISTINCT a.user_id) FILTER (WHERE a.d >= 30) AS d30
    FROM act a GROUP BY 1
  )
  SELECT s.week_start, s.cohort_size, ca.cum_revenue_per_user,
         round(coalesce(rt.d1, 0)::NUMERIC * 100 / s.cohort_size, 1),
         round(coalesce(rt.d7, 0)::NUMERIC * 100 / s.cohort_size, 1),
         round(coalesce(rt.d30, 0)::NUMERIC * 100 / s.cohort_size, 1)
  FROM sizes s
  JOIN cum_arr ca ON ca.week_start = s.week_start
  LEFT JOIN ret rt ON rt.week_start = s.week_start
  ORDER BY s.week_start DESC;
$$;

-- ── 권한: service_role 전용 (게이트는 라우트의 requireAdmin 이 담당) ──
-- 🔴 AGENTS.md 규칙 — 새 SECURITY DEFINER RPC 는 PUBLIC·anon·authenticated 셋 다 회수한다.
--    2026-07-29 부터 기본 권한이 닫혀 있어 새 함수는 닫힌 채 태어나지만, 기본값은 언제든
--    플랫폼 쪽에서 되돌아갈 수 있고 이중 방어가 싸다.
--    시그니처를 전부 명시한다 — 이름만 쓰면 오버로드가 생겼을 때 조용히 대상이 어긋난다.
REVOKE EXECUTE ON FUNCTION admin_canonical_creative(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_analytics_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_product_breakdown(TIMESTAMPTZ, UUID[], TEXT[], INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_pass_breakdown(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_funnel(TIMESTAMPTZ, UUID[], JSONB, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_cohorts(TIMESTAMPTZ, UUID[], INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_canonical_creative(TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION admin_analytics_trend(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_product_breakdown(TIMESTAMPTZ, UUID[], TEXT[], INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_pass_breakdown(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_funnel(TIMESTAMPTZ, UUID[], JSONB, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_cohorts(TIMESTAMPTZ, UUID[], INT) TO service_role;
