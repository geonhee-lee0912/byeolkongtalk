# 플랜 B — `/admin/analytics` 4라우트 RPC 전환 + `stats` 중복 해소 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/api/admin/analytics/{trends,products,funnel,cohorts}` 와 `/api/admin/stats` 의 집계를 Postgres RPC 로 전환한다. 이 4라우트는 `readings` 30일(만재 시 cap 13.7배)·`users` 84일(15.9배)로 **다음 천장에 닿을 순서 1·3위**다.

**Architecture:** 플랜 A 와 같은 원칙 — 집계는 Postgres, 앱은 결과만. 이 라우트들은 **KST 자정 기준**이라(플랜 A 의 오전 10시 롤오버와 다름) SQL 표현이 `((created_at + interval '9 hours')::date)` 다. `.in(userIds)` 2단 조회(funnel 은 수백~수천 개를 URL 에 실었다)가 조인으로 사라지는 것이 부수 이득이다.

**Tech Stack:** Next.js 16 App Router · Supabase 마이그레이션 Git sync · `node --import tsx --test`

**선행:** 플랜 A 완료 (`scripts/admin-expected-values.sql` 과 `docs/superpowers/specs/2026-07-29-admin-expected-values.md` 가 존재해야 한다 — 이 플랜은 거기에 지표를 **추가**한다)

**설계 정본:** `docs/superpowers/specs/2026-07-29-admin-aggregation-rpc-and-visitor-mix-design.md`

---

## ⚠️ 이 플랜이 건드리지 않는 것

| 대상 | 이유 | 어디서 |
|---|---|---|
| `products` 의 `buildStarSpendBreakdown`(E3·E4) | 15단 우선순위 사다리 = 종류 C | 플랜 D |
| `paywall` · `relationship` · `relationship-readings` · `ads` · `popups` | 별 화면 묶음 | 플랜 C |
| 부수 버그 5건 | 값이 의도적으로 달라져 대조가 깨진다 | 플랜 D |
| `Max rows` 원복 | 나머지 화면이 아직 cap 의존 | 플랜 D 마지막 |

**`products` 는 이 플랜에서 부분 전환된다** — E1(readings)·E2(payments)·E5(passes)만 RPC 로 가고, E3·E4(별 소모)는 현행 유지. 화면은 계속 정상 동작한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| **Create** `supabase/migrations/20260730000000_admin_analytics_aggregates.sql` | `admin_canonical_creative` 헬퍼 + RPC 5개 |
| **Modify** `scripts/admin-expected-values.sql` | 이 4라우트 지표를 정답지에 추가 |
| **Modify** `docs/superpowers/specs/2026-07-29-admin-expected-values.md` | 추가 지표 값 + 대조 결과 |
| **Modify** `app/api/admin/analytics/trends/route.ts` | 3쿼리 → RPC 1 |
| **Modify** `app/api/admin/analytics/products/route.ts` | E1·E2·E5 → RPC 2 (E3·E4 유지) |
| **Modify** `app/api/admin/analytics/funnel/route.ts` | 5쿼리 → RPC 1 |
| **Modify** `app/api/admin/analytics/cohorts/route.ts` | 3쿼리 → RPC 1 |
| **Modify or Delete** `app/api/admin/stats/route.ts` | 소비처 조사 결과에 따라 |

---

## Task 1: 정답지에 analytics 지표 추가

**Files:**
- Modify: `scripts/admin-expected-values.sql`
- Modify: `docs/superpowers/specs/2026-07-29-admin-expected-values.md`

RPC 를 쓰기 전에 정답지를 먼저 확장한다. **순서를 뒤집으면 검증 기준이 없다.**

- [ ] **Step 1: CTE 추가**

`scripts/admin-expected-values.sql` 의 `with` 블록에 추가한다(마지막 CTE 뒤, `select 'trend' ...` 앞). 어드민 제외는 정답지에서 계속 미적용이다.

```sql
-- ── 7. analytics 트렌드 (KST 자정 — traffic 과 기준이 다르다) ──
atrend as (
  select bucket, sum(nu) as new_users, sum(rd) as readings, sum(rev) as revenue_won
  from (
    select ((created_at + interval '9 hours')::date) as bucket, 1 as nu, 0 as rd, 0 as rev
      from users where created_at >= (now() - interval '30 days')
    union all
    select ((created_at + interval '9 hours')::date), 0, 1, 0
      from readings where created_at >= (now() - interval '30 days')
    union all
    select ((created_at + interval '9 hours')::date), 0, 0, coalesce(amount_won, 0)
      from payments where status = 'completed' and created_at >= (now() - interval '30 days')
  ) t group by 1
),
-- ── 8. 상품 분해 — 상담(사주/타로) ──
-- 연애 스레드는 제외. 운세(emotion_tag 'fortune:*')는 별 그룹.
acounsel as (
  select consultation_type, coalesce(emotion_tag, '(없음)') as emotion_tag,
         count(*) as cnt, count(*) filter (where coalesce(stars_spent,0) > 0) as paid_cnt,
         sum(coalesce(stars_spent,0)) as stars
  from readings
  where created_at >= (now() - interval '30 days')
    and consultation_type <> 'relationship'
    and (emotion_tag is null or emotion_tag not like 'fortune:%')
  group by 1,2
),
-- ── 9. 코호트 크기 (KST 월요일 = date_trunc('week')) ──
acohort as (
  select date_trunc('week', created_at + interval '9 hours')::date as week_start, count(*) as cohort_size
  from users where created_at >= (now() - interval '84 days')
  group by 1
),
-- ── 10. 퍼널 (소재별 가입) — canonicalCreative 별칭 미적용 상태의 원본 키 ──
afunnel as (
  select coalesce(nullif(a.utm_content, ''), '(organic)') as creative, count(distinct a.user_id) as signups
  from user_acquisition a
  where a.created_at >= (now() - interval '30 days')
  group by 1
)
```

- [ ] **Step 2: 최종 select 에 union 추가**

`scripts/admin-expected-values.sql` 의 마지막 `union all select 'consult_funnel', ...` 뒤에 붙인다:

```sql
union all select 'analytics_trend', to_jsonb(array_agg(t)) from (select * from atrend order by bucket) t
union all select 'product_counsel', to_jsonb(array_agg(c)) from (select * from acounsel order by cnt desc) c
union all select 'cohort_sizes',    to_jsonb(array_agg(h)) from (select * from acohort order by week_start desc) h
union all select 'funnel_signups',  to_jsonb(array_agg(f)) from (select * from afunnel order by signups desc) f
```

- [ ] **Step 3: 실행**

```bash
SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/admin-expected-values.sql
```
Expected: metric 10개 행. 새로 추가한 4개(`analytics_trend`·`product_counsel`·`cohort_sizes`·`funnel_signups`)에 값이 있다.

- [ ] **Step 4: 정답지 문서에 추가 + 커밋**

`docs/superpowers/specs/2026-07-29-admin-expected-values.md` 에 "플랜 B 지표" 절을 만들고 Step 3 출력을 옮긴다. **`analytics_trend` 는 KST 자정 버킷**이라 플랜 A 의 `trend`(오전 10시 롤오버)와 날짜가 다르게 나오는 것이 정상임을 한 줄로 명시한다.

```bash
git add scripts/admin-expected-values.sql docs/superpowers/specs/2026-07-29-admin-expected-values.md
git commit -m "docs(admin): 정답지에 analytics 4라우트 지표 추가"
```

---

## Task 2: 마이그레이션 — analytics RPC 5개

**Files:**
- Create: `supabase/migrations/20260730000000_admin_analytics_aggregates.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 어드민 애널리틱스 집계 RPC (2026-07-30)
-- 설계 정본: docs/superpowers/specs/2026-07-29-admin-aggregation-rpc-and-visitor-mix-design.md
--
-- ⚠️ 이 파일의 모든 날짜 버킷은 **KST 자정** 기준이다: ((created_at + interval '9 hours')::date)
--    플랜 A 의 traffic RPC 는 **오전 10시 롤오버**다. 섞으면 같은 "오늘" 이 다른 걸 뜻한다.
--    (기준 표는 lib/admin-time.ts 주석)
--
-- 어드민 제외: 이 테이블들은 user_id 가 NULL 이 아니므로 page_views 의 3값 논리 문제가 없다.
-- 현행 앱이 .not("user_id","in",…) 를 쓰던 것과 동일하게 `<> all(p_exclude)` 를 쓴다
-- (user_id 가 NULL 이면 NULL → 제외됨. 현행과 같은 동작).

-- ── 별칭 병합 (lib/analytics/creative-alias.ts canonicalCreative 와 1:1) ──
-- trim 하지 않는다 — JS 도 exact-match 다. 빈 문자열·null 은 그대로 통과시키고
-- '(organic)' 폴백은 호출부가 담당한다.
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
  SELECT bucket, sum(nu)::BIGINT, sum(rd)::BIGINT, sum(rev)::BIGINT
  FROM (
    SELECT ((created_at + interval '9 hours')::date) AS bucket, 1 AS nu, 0 AS rd, 0 AS rev
      FROM users
      WHERE created_at >= p_since AND id <> ALL(p_exclude)
    UNION ALL
    SELECT ((created_at + interval '9 hours')::date), 0, 1, 0
      FROM readings
      WHERE created_at >= p_since AND user_id <> ALL(p_exclude)
    UNION ALL
    SELECT ((created_at + interval '9 hours')::date), 0, 0, coalesce(amount_won, 0)
      FROM payments
      WHERE status = 'completed' AND created_at >= p_since AND user_id <> ALL(p_exclude)
  ) t
  GROUP BY bucket ORDER BY bucket;
$$;

-- ── 2. 상품 분해 (상담 / 운세 / 패키지) ──
-- p_fortune_types: 유효한 운세 타입 키 배열. 앱의 FORTUNE_CONFIG 에서 주입한다.
-- ⚠️ like 'fortune:%' 만으로 판정하면 'fortune:오타' 를 앱은 상담으로, SQL 은 운세로 분류해
--    조용히 어긋난다(fortuneTypeFromTag 는 접미사가 유효 키일 때만 운세로 본다).
-- 연애 스레드(consultation_type='relationship')는 counsel 에서 제외 — 별 소모·연애 메뉴에서 다룬다.
-- 🔴 p_limit — counsel 갈래는 (consultation_type × emotion_tag) 카디널리티에 비례한다.
--    emotion_tag 가 자유 문자열이라 상한이 없다 → RPC 도 PostgREST 를 지나므로 cap 재발 가능.
--    fortune 갈래는 p_fortune_types 길이로 이미 유계라 상한이 필요 없다.
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
    SELECT consultation_type, emotion_tag, coalesce(stars_spent, 0) AS stars_spent,
           CASE
             WHEN emotion_tag LIKE 'fortune:%'
              AND substring(emotion_tag FROM 9) = ANY(p_fortune_types)
             THEN substring(emotion_tag FROM 9)
             ELSE NULL
           END AS fortune_kind
    FROM readings
    WHERE created_at >= p_since
      AND user_id <> ALL(p_exclude)
      AND consultation_type <> 'relationship'
  )
  -- counsel: 상한을 박고 cnt 내림차순으로 상위만 (앱의 count desc 정렬과 같은 기준이라
  -- 잘려도 "상위 N" 이 되어 순서가 뒤바뀌지 않는다)
  SELECT * FROM (
    SELECT 'counsel'::TEXT, consultation_type, coalesce(emotion_tag, '(없음)'),
           count(*), count(*) FILTER (WHERE stars_spent > 0), sum(stars_spent)::BIGINT, NULL::BIGINT
    FROM r WHERE fortune_kind IS NULL
    GROUP BY 1, 2, 3
    ORDER BY 4 DESC
    LIMIT p_limit
  ) counsel_top
  UNION ALL
  -- fortune: p_fortune_types 로 이미 유계 (상한 불필요)
  SELECT 'fortune', fortune_kind, NULL,
         count(*), count(*) FILTER (WHERE stars_spent > 0), sum(stars_spent)::BIGINT, NULL::BIGINT
  FROM r WHERE fortune_kind IS NOT NULL
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT * FROM (
    SELECT 'package'::TEXT, coalesce(package_type, '(없음)'), NULL::TEXT,
           count(*), NULL::BIGINT, NULL::BIGINT, sum(coalesce(amount_won, 0))::BIGINT
    FROM payments
    WHERE status = 'completed' AND created_at >= p_since AND user_id <> ALL(p_exclude)
    GROUP BY 1, 2, 3
    ORDER BY 7 DESC
    LIMIT p_limit
  ) package_top;
$$;

-- ── 3. 연애 패스 집계 (products 화면의 인라인 passAgg 를 대체) ──
CREATE OR REPLACE FUNCTION admin_pass_breakdown(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (pass_kind TEXT, cnt BIGINT, stars BIGINT, buyers BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT kind, count(*), sum(coalesce(stars_spent, 0))::BIGINT, count(DISTINCT user_id)
  FROM relationship_passes
  WHERE created_at >= p_since AND user_id <> ALL(p_exclude)
  GROUP BY kind ORDER BY kind;
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
--    `Max rows` cap 이 그대로 적용된다. 상한을 안 박으면 "RPC 로 바꿨는데 또 조용히 잘리는"
--    사고가 재발한다. 상한 도달은 앱이 경고로 드러낸다(조용한 절단 금지).
CREATE OR REPLACE FUNCTION admin_funnel(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_aliases JSONB, p_limit INT DEFAULT 200
)
RETURNS TABLE (
  creative TEXT, signups BIGINT, tried BIGINT, first_paid BIGINT, repaid BIGINT,
  signup_to_paid_pct NUMERIC, revenue_won BIGINT, spend_won BIGINT, cac BIGINT, roas NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH tracked AS (
    SELECT a.user_id,
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
    SELECT DISTINCT creative, user_id FROM (
      SELECT * FROM tracked UNION ALL SELECT * FROM untracked
    ) g
  ), per_user AS (
    SELECT g.creative, g.user_id,
           EXISTS (SELECT 1 FROM readings r WHERE r.user_id = g.user_id) AS tried,
           (SELECT count(*) FROM payments p
             WHERE p.user_id = g.user_id AND p.status = 'completed') AS paid_n,
           (SELECT coalesce(sum(p.amount_won), 0) FROM payments p
             WHERE p.user_id = g.user_id AND p.status = 'completed') AS rev
    FROM grp g
  ), agg AS (
    SELECT creative,
           count(*)::BIGINT AS signups,
           count(*) FILTER (WHERE tried)::BIGINT AS tried,
           count(*) FILTER (WHERE paid_n >= 1)::BIGINT AS first_paid,
           count(*) FILTER (WHERE paid_n >= 2)::BIGINT AS repaid,
           sum(rev)::BIGINT AS revenue_won
    FROM per_user GROUP BY creative
  ), spend AS (
    SELECT creative_key, sum(spend_won)::BIGINT AS spend_won
    FROM ad_spend
    WHERE spend_date >= (p_since + interval '9 hours')::date
    GROUP BY creative_key
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
    SELECT id, created_at,
           date_trunc('week', created_at + interval '9 hours')::date AS week_start
    FROM users WHERE created_at >= p_since AND id <> ALL(p_exclude)
  ), sizes AS (
    SELECT week_start, count(*)::BIGINT AS cohort_size FROM u GROUP BY 1
  ), rev AS (
    SELECT u.week_start,
           greatest(0, floor(extract(epoch FROM (p.created_at - u.created_at)) / 86400 / 7))::INT AS wi,
           sum(coalesce(p.amount_won, 0))::BIGINT AS amt
    FROM u JOIN payments p ON p.user_id = u.id AND p.status = 'completed'
    GROUP BY 1, 2
  ), series AS (
    SELECT s.week_start, gs.wi FROM sizes s
    CROSS JOIN generate_series(0, p_weeks - 1) AS gs(wi)
  ), cum AS (
    -- wi >= p_weeks 인 결제는 series 에 없어 자동 제외된다 (현행 `if (wi >= weeks) continue`)
    SELECT se.week_start, se.wi,
           sum(coalesce(r.amt, 0)) OVER (PARTITION BY se.week_start ORDER BY se.wi) AS running
    FROM series se LEFT JOIN rev r ON r.week_start = se.week_start AND r.wi = se.wi
  ), cum_arr AS (
    SELECT c.week_start,
           array_agg(round(c.running::NUMERIC / s.cohort_size)::BIGINT ORDER BY c.wi) AS cum_revenue_per_user
    FROM cum c JOIN sizes s ON s.week_start = c.week_start
    GROUP BY c.week_start
  ), act AS (
    SELECT u.week_start, r.user_id,
           floor(extract(epoch FROM (r.created_at - u.created_at)) / 86400) AS d
    FROM u JOIN readings r ON r.user_id = u.id
  ), ret AS (
    SELECT week_start,
           count(DISTINCT user_id) FILTER (WHERE d >= 1) AS d1,
           count(DISTINCT user_id) FILTER (WHERE d >= 7) AS d7,
           count(DISTINCT user_id) FILTER (WHERE d >= 30) AS d30
    FROM act GROUP BY 1
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

-- ── 권한: service_role 전용 ──
REVOKE EXECUTE ON FUNCTION admin_canonical_creative FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_analytics_trend FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_product_breakdown FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_pass_breakdown FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_funnel FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_cohorts FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_canonical_creative TO service_role;
GRANT EXECUTE ON FUNCTION admin_analytics_trend TO service_role;
GRANT EXECUTE ON FUNCTION admin_product_breakdown TO service_role;
GRANT EXECUTE ON FUNCTION admin_pass_breakdown TO service_role;
GRANT EXECUTE ON FUNCTION admin_funnel TO service_role;
GRANT EXECUTE ON FUNCTION admin_cohorts TO service_role;
```

- [ ] **Step 2: 적용 전에 prod 에서 본문 대조 — trend**

```bash
SUPABASE_PAT=<값> node scripts/run-prod-query.mjs --sql "
select bucket, sum(nu) new_users, sum(rd) readings, sum(rev) revenue_won from (
  select ((created_at + interval '9 hours')::date) bucket, 1 nu, 0 rd, 0 rev
    from users where created_at >= (now() - interval '30 days') and id <> all('{}'::uuid[])
  union all select ((created_at + interval '9 hours')::date), 0, 1, 0
    from readings where created_at >= (now() - interval '30 days') and user_id <> all('{}'::uuid[])
  union all select ((created_at + interval '9 hours')::date), 0, 0, coalesce(amount_won,0)
    from payments where status='completed' and created_at >= (now() - interval '30 days') and user_id <> all('{}'::uuid[])
) t group by 1 order by 1"
```
Expected: Task 1 의 `analytics_trend` 와 **완전 일치**.

- [ ] **Step 3: 적용 전에 prod 에서 본문 대조 — counsel**

`admin_product_breakdown` 의 `counsel` 갈래를 인라인으로 돌려 Task 1 의 `product_counsel` 과 대조한다. `p_fortune_types` 자리에는 실제 운세 타입 배열을 넣는다 — 먼저 확인:

Run: `grep -rn "FORTUNE_CONFIG" lib/fortune/types.ts | head -3` 로 위치를 잡고 키 목록을 읽는다.

그 키들을 `'{키1,키2,…}'::text[]` 로 넣어 실행한 뒤, `counsel` 행이 Task 1 값과 일치하는지 본다.

⚠️ 정답지의 `acounsel` 은 `emotion_tag not like 'fortune:%'` 로 단순 필터했지만 RPC 는 **유효 키 검사**까지 한다. 두 값이 다르면 `'fortune:'` prefix 이지만 유효 키가 아닌 태그가 실제로 존재한다는 뜻이다 — **그 경우 RPC 값이 정답이고 정답지 쿼리를 RPC 정의에 맞춰 고친다**(그리고 그 태그를 정답지 문서에 기록한다).

- [ ] **Step 4: 적용 전에 prod 에서 본문 대조 — funnel · cohorts**

`admin_funnel` 과 `admin_cohorts` 본문을 같은 방식으로 인라인 실행한다. `p_aliases` 는 `'{"새 판매 광고 - 사본":"tarot"}'::jsonb`, `p_exclude` 는 `'{}'::uuid[]`, `p_weeks` 는 12.

대조 기준:
- `admin_funnel` 의 `signups` 합 ≈ Task 1 `funnel_signups` (별칭 병합 때문에 `새 판매 광고 - 사본` 행이 `tarot` 로 합쳐지는 차이만 있어야 한다)
- `admin_cohorts` 의 `week_start`·`cohort_size` = Task 1 `cohort_sizes` 와 **완전 일치**
- `cum_revenue_per_user` 배열 길이 = 12, 단조 증가(누적이므로)
- `d1 >= d7 >= d30` (누적 정의라 반드시 성립. 어긋나면 부등호 방향 버그)

- [ ] **Step 5: dev push + 적용 확인**

```bash
git add supabase/migrations/20260730000000_admin_analytics_aggregates.sql
git commit -m "feat(admin): analytics 집계 RPC 5개 (KST 자정 기준)"
git push origin dev
```
GitHub Actions(Supabase Git sync) 로그 SUCCESS 확인. 그리고 dev DB 에서 함수 존재 확인:

```bash
SUPABASE_PAT=<값> SUPABASE_PROJECT_REF=vtdmxdcetziileynjaxi node scripts/run-prod-query.mjs --sql "
select proname from pg_proc where proname in ('admin_canonical_creative','admin_analytics_trend','admin_product_breakdown','admin_pass_breakdown','admin_funnel','admin_cohorts') order by 1"
```
Expected: 6행

---

## Task 3: `trends` 라우트 전환

**Files:**
- Modify: `app/api/admin/analytics/trends/route.ts`

- [ ] **Step 1: 현행 확인**

Run: `cat app/api/admin/analytics/trends/route.ts`
확인할 것: `since`·`todayKst` 를 만드는 함수, 응답 필드명, `buildTrends` 호출부.

- [ ] **Step 2: 순수 함수 추가 — 날짜 축 채우기**

`lib/analytics/aggregate.ts` 에 추가한다(`buildTrends` 는 **삭제하지 않는다** — 테스트 자산):

```ts
/**
 * RPC(admin_analytics_trend) 의 일별 행에 날짜 축을 채운다(없는 날 0). 축 밖 날짜는 버린다.
 * buildTrends 의 프리필과 같은 목적 — 수집이 끊긴 날이 행째로 사라지면 그래프가 거짓말을 한다.
 */
export function fillTrendAxis(
  rows: TrendPoint[],
  days: number,
  todayKst: string
): TrendPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const base = new Date(`${todayKst}T00:00:00Z`);
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    const hit = byDate.get(d);
    out.push({
      date: d,
      newUsers: hit?.newUsers ?? 0,
      readings: hit?.readings ?? 0,
      revenueWon: hit?.revenueWon ?? 0,
    });
  }
  return out;
}
```

- [ ] **Step 3: 테스트 추가 (`lib/analytics/aggregate.test.ts`)**

```ts
test("fillTrendAxis — 수집이 없던 날도 0 으로 축에 남고 축 밖은 버린다", () => {
  const out = fillTrendAxis(
    [
      { date: "2026-07-10", newUsers: 5, readings: 5, revenueWon: 5000 },
      { date: "2026-07-28", newUsers: 31, readings: 12, revenueWon: 19600 },
    ],
    3,
    "2026-07-28"
  );
  assert.deepEqual(out.map((p) => p.date), ["2026-07-26", "2026-07-27", "2026-07-28"]);
  assert.deepEqual(out.map((p) => p.newUsers), [0, 0, 31]);
  assert.equal(out.find((p) => p.date === "2026-07-10"), undefined);
});
```

Run: `node --import tsx --test lib/analytics/aggregate.test.ts`
Expected: 먼저 FAIL(`fillTrendAxis is not a function`) → Step 2 적용 후 PASS

- [ ] **Step 4: 라우트 전환**

3개 쿼리를 RPC 1개로 바꾼다. `since`·`todayKst`·응답 필드명은 Step 1 에서 확인한 것을 그대로 유지한다:

```ts
  const { data, error } = await supa.rpc("admin_analytics_trend", {
    p_since: since,
    p_exclude: adminExclusionArray(),
  });
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  const points = fillTrendAxis(
    (data ?? []).map(
      (r: { bucket: string; new_users: number; readings: number; revenue_won: number }) => ({
        date: r.bucket,
        newUsers: Number(r.new_users),
        readings: Number(r.readings),
        revenueWon: Number(r.revenue_won),
      })
    ),
    days,
    todayKst
  );
```

import 에서 `buildTrends` 를 빼고 `fillTrendAxis`·`adminExclusionArray` 를 넣는다.

- [ ] **Step 5: 검증 + 커밋**

Run: `npx tsc --noEmit` → 에러 0
`/admin/analytics` 트렌드 차트가 그대로 렌더되고 값이 Task 1 정답지와 일치하는지 확인(어드민 제외분 차이만).

```bash
git add app/api/admin/analytics/trends/route.ts lib/analytics/aggregate.ts lib/analytics/aggregate.test.ts
git commit -m "refactor(admin): analytics 트렌드 3쿼리 → RPC 1"
```

---

## Task 4: `cohorts` 라우트 전환

**Files:**
- Modify: `app/api/admin/analytics/cohorts/route.ts`

반환 행수가 **정확히 12** 로 고정되는 가장 깔끔한 전환이다.

- [ ] **Step 1: 현행 확인**

Run: `cat app/api/admin/analytics/cohorts/route.ts`
확인할 것: `since`(84일) 계산, `weeks` 상수, 응답 필드명(`weekStart`·`cohortSize`·`cumRevenuePerUser`·`retention`).

- [ ] **Step 2: 라우트 전환**

```ts
  const { data, error } = await supa.rpc("admin_cohorts", {
    p_since: since,
    p_exclude: adminExclusionArray(),
    p_weeks: WEEKS,   // Step 1 에서 확인한 기존 상수를 그대로 쓴다
  });
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  const cohorts = (data ?? []).map(
    (r: {
      week_start: string;
      cohort_size: number;
      cum_revenue_per_user: number[];
      d1: number;
      d7: number;
      d30: number;
    }) => ({
      weekStart: r.week_start,
      cohortSize: Number(r.cohort_size),
      cumRevenuePerUser: (r.cum_revenue_per_user ?? []).map(Number),
      retention: { d1: Number(r.d1), d7: Number(r.d7), d30: Number(r.d30) },
    })
  );
```

`buildCohorts` 호출과 `users`/`payments`/`readings` 3쿼리를 삭제한다. **`lib/analytics/aggregate.ts` 의 `buildCohorts` 함수 자체는 지우지 않는다.**

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit` → 에러 0

`/admin/analytics` 코호트 표에서 확인:
- 행 수·`weekStart`·`cohortSize` 가 Task 1 `cohort_sizes` 와 일치
- `cumRevenuePerUser` 가 12칸이고 왼쪽→오른쪽 단조 증가
- 각 행에서 `d1 >= d7 >= d30`
- 정렬이 `weekStart` 내림차순(최신 주가 위)

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/analytics/cohorts/route.ts
git commit -m "refactor(admin): 코호트 3쿼리 → RPC 1 (반환 12행 고정)"
```

---

## Task 5: `funnel` 라우트 전환

**Files:**
- Modify: `app/api/admin/analytics/funnel/route.ts`

`.in("user_id", userIds)` 로 수백~수천 개를 URL 에 싣던 2단 조회가 사라진다 — cap 뿐 아니라 **URL 길이 한계**도 같이 해소된다.

- [ ] **Step 1: 현행 확인**

Run: `cat app/api/admin/analytics/funnel/route.ts`
확인할 것: `since` 계산, 응답 필드명, `canonicalCreative` 적용 위치.

- [ ] **Step 2: 라우트 전환**

```ts
import { CREATIVE_ALIASES } from "@/lib/analytics/creative-alias";

  // 별칭 맵을 RPC 인자로 넘긴다 — 맵의 단일 원천을 앱에 유지하기 위함.
  const { data, error } = await supa.rpc("admin_funnel", {
    p_since: since,
    p_exclude: adminExclusionArray(),
    p_aliases: CREATIVE_ALIASES,
  });
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  const rows = (data ?? []).map(
    (r: {
      creative: string;
      signups: number;
      tried: number;
      first_paid: number;
      repaid: number;
      signup_to_paid_pct: number;
      revenue_won: number;
      spend_won: number | null;
      cac: number | null;
      roas: number | null;
    }) => ({
      creative: r.creative,
      signups: Number(r.signups),
      tried: Number(r.tried),
      firstPaid: Number(r.first_paid),
      repaid: Number(r.repaid),
      signupToPaidPct: Number(r.signup_to_paid_pct),
      revenueWon: Number(r.revenue_won),
      spendWon: r.spend_won === null ? null : Number(r.spend_won),
      cac: r.cac === null ? null : Number(r.cac),
      roas: r.roas === null ? null : Number(r.roas),
    })
  );
```

5개 쿼리(`user_acquisition`·`users`·`readings`·`payments`·`ad_spend`)와 `buildFunnel` 호출을 삭제한다. **`buildFunnel` 함수 자체는 유지.**

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit` → 에러 0

`/admin/analytics` 퍼널 표에서 확인:
- `새 판매 광고 - 사본` 행이 **없고** `tarot` 로 병합됐다(별칭 적용 증거)
- 정렬: 일반 소재 → `(organic)` → `(추적 안 됨)`
- `(organic)` 행의 `spendWon`·`cac`·`roas` 가 전부 비어 있다
- `tried <= signups`, `repaid <= firstPaid <= signups`
- `signups` 합이 Task 1 `funnel_signups` 합과 일치(별칭 병합 차이만)

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/analytics/funnel/route.ts
git commit -m "refactor(admin): 퍼널 5쿼리 → RPC 1 (.in() URL 폭발 해소)"
```

---

## Task 6: `products` 라우트 부분 전환 (E1·E2·E5)

**Files:**
- Modify: `app/api/admin/analytics/products/route.ts`

⚠️ **별 소모(E3·E4, `buildStarSpendBreakdown`)는 이 태스크에서 건드리지 않는다** — 종류 C 이므로 플랜 D.

- [ ] **Step 1: 현행 확인**

Run: `cat app/api/admin/analytics/products/route.ts`
확인할 것: `since`, 응답 필드명, 인라인 `passAgg` 블록의 정확한 위치와 출력 형태, `FORTUNE_CONFIG` 키를 얻는 경로.

- [ ] **Step 2: 운세 타입 키 배열의 원천 확인**

Run: `grep -rn "export const FORTUNE_CONFIG" -A 5 lib/fortune/types.ts`
목적: `Object.keys(FORTUNE_CONFIG)` 를 RPC 의 `p_fortune_types` 로 넘기기 위함. `fortuneTypeFromTag` 가 유효 키로 판정하는 그 목록과 **같은 원천**이어야 한다.

- [ ] **Step 3: 라우트 전환 (readings·payments·passes)**

```ts
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

  const [pb, pass] = await Promise.all([
    supa.rpc("admin_product_breakdown", {
      p_since: since,
      p_exclude: adminExclusionArray(),
      // 유효 운세 타입의 단일 원천을 앱에 유지한다 — SQL 에서 like 'fortune:%' 만 쓰면
      // 'fortune:오타' 를 앱은 상담으로, SQL 은 운세로 분류해 조용히 어긋난다.
      p_fortune_types: Object.keys(FORTUNE_CONFIG),
    }),
    supa.rpc("admin_pass_breakdown", { p_since: since, p_exclude: adminExclusionArray() }),
  ]);
  if (pb.error || pass.error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type PbRow = {
    kind: string; key1: string; key2: string | null;
    cnt: number; paid_cnt: number | null; stars: number | null; revenue_won: number | null;
  };
  const pbRows = (pb.data ?? []) as PbRow[];
  const counsel = pbRows
    .filter((r) => r.kind === "counsel")
    .map((r) => ({
      consultationType: r.key1 as "saju" | "tarot",
      emotionTag: r.key2 ?? "(없음)",
      count: Number(r.cnt),
      paidCount: Number(r.paid_cnt ?? 0),
      starsSpent: Number(r.stars ?? 0),
    }))
    .sort((a, b) => b.count - a.count);
  const fortune = pbRows
    .filter((r) => r.kind === "fortune")
    .map((r) => ({
      kind: r.key1,
      count: Number(r.cnt),
      paidCount: Number(r.paid_cnt ?? 0),
      starsSpent: Number(r.stars ?? 0),
    }))
    .sort((a, b) => b.count - a.count);
  const packages = pbRows
    .filter((r) => r.kind === "package")
    .map((r) => ({
      packageType: r.key1,
      count: Number(r.cnt),
      revenueWon: Number(r.revenue_won ?? 0),
    }))
    .sort((a, b) => b.revenueWon - a.revenueWon);
  const passes = (pass.data ?? []).map(
    (r: { pass_kind: string; cnt: number; stars: number; buyers: number }) => ({
      kind: r.pass_kind,
      count: Number(r.cnt),
      starsSpent: Number(r.stars),
      buyers: Number(r.buyers),
    })
  );
```

`readings`(E1)·`payments`(E2)·`relationship_passes`(E5) 쿼리와 `buildProductBreakdown` 호출, 인라인 `passAgg` 블록을 삭제한다. `star_transactions`(E3)·`readings in()`(E4) 조회와 `buildStarSpendBreakdown` 호출은 **그대로 둔다.**

- [ ] **Step 4: 남은 종류 C 에 주석 남기기**

E3 쿼리 바로 위에 추가한다:

```ts
  // ⚠️ 아래 별 소모 집계(star_transactions + readings 조인)는 아직 원본 행을 받는다.
  // buildStarSpendBreakdown 의 15단 우선순위 사다리를 SQL 로 옮기는 작업(종류 C)이 남아 있어서다.
  // 계획: docs/superpowers/plans/2026-07-30-admin-rpc-d-typec-and-bugs.md
  // 30일 star_transactions 는 Supabase `Max rows` 에 걸릴 수 있다 — 그때까지 cap 을 낮추지 말 것.
```

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit` → 에러 0

`/admin/analytics` 상품 화면에서 확인:
- 상담·운세·패키지·패스 4개 표가 모두 렌더
- `counsel` 이 Task 1 `product_counsel` 과 일치 (Task 2 Step 3 에서 유효 키 불일치를 발견했다면 그 조정을 반영한 값)
- 운세 표의 `kind` 가 전부 `FORTUNE_CONFIG` 유효 키
- 별 소모 표가 **전환 전과 동일한 값** (건드리지 않았으므로)

- [ ] **Step 6: 커밋**

```bash
git add app/api/admin/analytics/products/route.ts
git commit -m "refactor(admin): 상품 분해 readings·payments·passes → RPC 2 (별 소모는 플랜 D)"
```

---

## Task 7: `stats` 라우트 — 소비처 조사 후 삭제 or 통일

**Files:**
- Modify or Delete: `app/api/admin/stats/route.ts`

5쿼리 전부 `/admin/page.tsx` 와 중복이고, `today`(오전 10시 롤오버)와 `week`(KST 자정)를 **한 엔드포인트 안에서 혼용**한다.

- [ ] **Step 1: 소비처 조사**

```bash
grep -rn "admin/stats" --include=*.ts --include=*.tsx --include=*.md . | grep -v node_modules
```
Expected: 호출부 목록. **0건이면 삭제가 답이다.**

- [ ] **Step 2-A: 소비처가 없으면 삭제**

```bash
git rm app/api/admin/stats/route.ts
git commit -m "chore(admin): /api/admin/stats 삭제 — 대시보드와 전량 중복 + 날짜 기준 혼용"
```

- [ ] **Step 2-B: 소비처가 있으면 날짜 기준 통일 + RPC 재사용**

`today` 와 `week` 를 **둘 다 오전 10시 롤오버**로 맞춘다(대시보드와 같은 기준 = 두 화면 숫자를 나란히 읽을 수 있게). 그리고 `payments` 의 앱 `sum` 을 `admin_analytics_trend` 재사용으로 대체한다. 변경 후 응답 필드명은 그대로 유지해 호출부를 깨지 않는다.

⚠️ **이 변경은 `week` 값을 바꾼다** — 부수 버그 #2 의 수정에 해당한다. `docs/superpowers/specs/2026-07-29-admin-expected-values.md` 에 **변경 전/후 `week` 값 양쪽을 기록**한다(스펙 §7 안전장치).

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit` → 에러 0
2-A 를 골랐다면 `grep -rn "admin/stats"` 가 0건인지 재확인. 2-B 라면 호출부 화면이 정상 렌더되는지 확인.

---

## Task 8: prod 검증 + 정답지 대조

**Files:**
- Modify: `docs/superpowers/specs/2026-07-29-admin-expected-values.md`

- [ ] **Step 1: 전체 테스트 + 타입 체크**

```bash
node --import tsx --test lib/**/*.test.ts qa/*.test.ts
npx tsc --noEmit
```
Expected: 전부 통과(플랜 A 의 29개 + `fillTrendAxis` 1개 포함), 타입 에러 0

- [ ] **Step 2: dev Preview 확인**

```bash
git push origin dev
```
`dev.byeolkongtalk.com/admin/analytics` 4개 탭(트렌드·상품·퍼널·코호트)을 모두 열어 렌더 확인.

- [ ] **Step 3: main 머지 + Workflow 확인**

```bash
git checkout main && git pull && git merge dev && git push origin main
```
⚠️ 로컬 `main` ref 는 항상 stale — `git pull` 필수.
Supabase main Workflow 로그 SUCCESS 확인(실패 시 prod RPC 부재로 `/admin/analytics` 가 500).

- [ ] **Step 4: prod 화면 ↔ 정답지 대조**

```bash
SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/admin-expected-values.sql
```

| 항목 | 기대 |
|---|---|
| 트렌드 일별 가입·리딩·매출 | `analytics_trend` 와 일치 (어드민 제외분 차이) |
| 상품 상담 표 | `product_counsel` 과 일치 |
| 코호트 주차·크기 | `cohort_sizes` 와 완전 일치 |
| 퍼널 `signups` 합 | `funnel_signups` 합과 일치(별칭 병합 차이만) |
| 코호트 각 행 | `d1 >= d7 >= d30`, 누적 배열 12칸 단조 증가 |
| 별 소모 표 | 전환 전과 동일(미전환) |

- [ ] **Step 5: 결과 기록 + 커밋**

```bash
git add docs/superpowers/specs/2026-07-29-admin-expected-values.md
git commit -m "docs(admin): 플랜 B 전환 후 정답지 대조 결과"
```

- [ ] **Step 6: `/admin/errors` 확인**

`admin_analytics_*`·`admin_funnel`·`admin_cohorts` 관련 500 이 없는지 확인. 기존 "설계된 정상 신호"(중복차단 warn·카카오 -101 info)는 버그가 아니다.

---

## 완료 조건

- [ ] `analytics` 4라우트에서 `.from("users")`·`.from("readings")`·`.from("payments")`·`.from("user_acquisition")`·`.from("ad_spend")`·`.from("relationship_passes")` 가 사라졌다 (`products` 의 `star_transactions`·`readings in()` 2개만 남는다 — 플랜 D 대상)
- [ ] 코호트 반환이 정확히 12칸 배열이고 `d1 >= d7 >= d30`
- [ ] 퍼널에서 `새 판매 광고 - 사본` 이 `tarot` 로 병합됐다
- [ ] `/api/admin/stats` 가 삭제됐거나 날짜 기준이 통일됐다
- [ ] prod 값이 정답지와 일치
- [ ] `npx tsc --noEmit` 클린, 전체 테스트 통과
