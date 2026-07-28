# 플랜 A — raw SQL 정답지 + traffic RPC 전환 + 방문자 구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/traffic` 과 `/admin` 대시보드의 `page_views` 집계를 Postgres RPC 로 전환하고, 방문자 구성(신규/연속/복귀) 지표를 신설한다. 착수 전 raw SQL 정답지를 만들어 d4(2026-07-30) 판독 산출물과 전환 검증 기대값을 동시에 확보한다.

**Architecture:** 원본 행을 앱으로 끌어오는 구조(`.limit(100000)` + Supabase `Max rows` cap)를 버리고, SQL 함수가 집계 결과만 반환한다. 방문자 구성은 `lag(bucket)` 을 **전체 테이블**에 돌린 뒤 창 필터를 걸어야 하므로(조회창 밖 첫 방문을 봐야 한다) RPC 로만 계산 가능하다. 순수 함수(`lib/analytics/traffic.ts`)는 삭제하지 않고 남긴다 — RPC 결과의 대조 기준이자 회귀 자산이다.

**Tech Stack:** Next.js 16 App Router · Supabase(PostgreSQL) 마이그레이션 Git sync · `node --import tsx --test` (테스트 러너 — `package.json` 에 `test` 스크립트 없음) · `scripts/run-prod-query.mjs`(Management API, `read_only:true` 고정)

**설계 정본:** `docs/superpowers/specs/2026-07-29-admin-aggregation-rpc-and-visitor-mix-design.md`

---

## 사전 확인 (2026-07-29 완료)

- `SUPABASE_PAT` 동작 확인됨. 사용법: `SUPABASE_PAT=<값> node scripts/run-prod-query.mjs --sql "..."`. **PAT 를 파일에 쓰지 말 것** — 셸 env 로만. `.env.local` 은 dev 리소스용이다.
- `page_views` prod 실측: 총 2,322행 · 첫 행 **2026-07-25** · 버킷 4개(7/25~7/28, 오전 10시 롤오버)
- 스펙 §2-3 의 `lag()` SQL 을 prod 에서 실행해 **3분할 합 = UV 가 4버킷 전부 일치** 확인:

| 버킷 | UV | 신규 | 연속 | 복귀 |
|---|---|---|---|---|
| 2026-07-25 | 65 | 65 | 0 | 0 |
| 2026-07-26 | 79 | 76 | 3 | 0 |
| 2026-07-27 | 57 | 52 | 3 | 2 |
| 2026-07-28 | 48 | 42 | 6 | 0 |

이 표가 Task 4·8 의 검증 기준값이다. (창이 밀리면 값이 변하니 Task 1 에서 다시 뜬다)

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| **Create** `scripts/admin-expected-values.sql` | 정답지 생성 쿼리 전량. 지표마다 `metric` 라벨을 붙여 한 번에 실행 |
| **Create** `docs/superpowers/specs/2026-07-29-admin-expected-values.md` | 위 실행 결과 = 정답지 + d4 판독 산출물 |
| **Create** `supabase/migrations/20260729000000_admin_traffic_aggregates.sql` | traffic RPC 6개 + `admin_normalize_entry` 헬퍼 |
| **Modify** `lib/admin.ts` | 어드민 제외 목록의 **배열 반환** 함수 추가 (RPC 는 `uuid[]` 인자) |
| **Modify** `lib/analytics/traffic.ts` | RPC 행 타입 + 표시 파생값 순수 함수(재방문율·날짜축 채우기·PV/UV) 추가. **기존 함수 삭제 금지** |
| **Modify** `lib/analytics/traffic.test.ts` | 신규 순수 함수 테스트 |
| **Modify** `components/admin/Stat.tsx` | `sub?: ReactNode` prop — 값 아래 서브라인 |
| **Modify** `app/api/admin/traffic/route.ts` | 단일 대량 조회 → RPC 6개 병렬 호출 |
| **Modify** `app/admin/traffic/page.tsx` | 오늘 카드 서브라인 + "방문자 구성" 섹션(차트+표) |
| **Modify** `app/admin/page.tsx` | `page_views` 조회 → `admin_traffic_trend` RPC + UV 카드 서브라인 |

---

## Task 1: raw SQL 정답지 — d4 판독 + 전환 기대값

**Files:**
- Create: `scripts/admin-expected-values.sql`
- Create: `docs/superpowers/specs/2026-07-29-admin-expected-values.md`

이 태스크가 이후 전 태스크의 정답지다. **스킵하면 검증 수단이 없다.**

- [ ] **Step 1: 정답지 쿼리 파일 작성**

`scripts/admin-expected-values.sql` 를 만든다. 어드민 제외는 정답지에서 **적용하지 않는다**(스펙 §6-5 고정점 628/400/320 이 "어드민 미제외" 기준이라 같은 조건으로 맞춰야 비교가 성립한다). 앱과 비교할 때는 이 차이를 감안한다 — Step 4 에 기록한다.

```sql
-- scripts/admin-expected-values.sql
-- 어드민 집계 RPC 전환의 정답지. Postgres 직결(Management API)이라 Supabase `Max rows` cap 무관.
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/admin-expected-values.sql
--
-- 어드민 제외 미적용 — 스펙 §6-5 고정점(628/400/320)과 같은 조건을 유지한다.
-- 오전 10시 롤오버 버킷: ((created_at + interval '9 hours' - interval '10 hours')::date)
-- KST 자정 버킷:        ((created_at + interval '9 hours')::date)

with
-- ── 1. page_views 일별 PV/UV (오전 10시 롤오버) ──
trend as (
  select ((created_at + interval '9 hours' - interval '10 hours')::date) as bucket,
         count(*) as pv,
         count(distinct anon_id) as uv
  from page_views
  where is_bot = false
  group by 1
),
-- ── 2. 방문자 구성 (신규/연속/복귀). prev 는 창 무관 = 전체 테이블 lag ──
visits as (
  select distinct anon_id,
         ((created_at + interval '9 hours' - interval '10 hours')::date) as bucket
  from page_views
  where anon_id is not null and is_bot = false
),
lagged as (
  select anon_id, bucket,
         lag(bucket) over (partition by anon_id order by bucket) as prev
  from visits
),
mix as (
  select bucket,
         count(*) as uv,
         count(*) filter (where prev is null) as new_uv,
         count(*) filter (where prev = bucket - 1) as streak_uv,
         count(*) filter (where prev < bucket - 1) as back_uv
  from lagged group by 1
),
-- ── 3. 봇 비율 (봇 포함 분모) ──
bot as (
  select count(*) as total_pv, count(*) filter (where is_bot) as bot_pv from page_views
),
-- ── 4. 라우트별 (PV 상위 20) ──
routes as (
  select path, count(distinct anon_id) as uv, count(*) as pv
  from page_views where is_bot = false
  group by 1 order by count(*) desc, count(distinct anon_id) desc limit 20
),
-- ── 5. 로그인 전/후 ──
auth as (
  select case when user_id is null then 'guest' else 'member' end as segment,
         count(distinct anon_id) as uv, count(*) as pv
  from page_views where is_bot = false group by 1
),
-- ── 6. 상담 퍼널 고정점 (스펙 §6-5: 628/400/320 이 2026-07-28 기준값) ──
consult as (
  select r.id, r.result_viewed_at
  from readings r
  where r.created_at >= (now() - interval '30 days')
    and (r.emotion_tag is null or r.emotion_tag not like 'fortune:%')
),
funnel as (
  select count(*) as started,
         count(*) filter (where exists (
           select 1 from messages m
           where m.reading_id = c.id and m.role = 'assistant' and m.content like '%[END]%'
         )) as ended,
         count(*) filter (where c.result_viewed_at is not null and exists (
           select 1 from messages m
           where m.reading_id = c.id and m.role = 'assistant' and m.content like '%[END]%'
         )) as viewed
  from consult c
)
select 'trend' as metric, to_jsonb(array_agg(t)) as value from (select * from trend order by bucket) t
union all select 'visitor_mix', to_jsonb(array_agg(m)) from (select * from mix order by bucket) m
union all select 'bot',         to_jsonb(array_agg(b)) from bot b
union all select 'routes',      to_jsonb(array_agg(r)) from routes r
union all select 'auth',        to_jsonb(array_agg(a)) from (select * from auth order by segment) a
union all select 'consult_funnel', to_jsonb(array_agg(f)) from funnel f;
```

- [ ] **Step 2: 실행해서 결과를 얻는다**

```bash
SUPABASE_PAT=<사용자가 전달한 값> node scripts/run-prod-query.mjs scripts/admin-expected-values.sql
```

Expected: `[{"metric":"trend","value":[...]}, {"metric":"visitor_mix",...}, ...]` 6개 metric 행. HTTP 에러면 PAT 또는 SQL 문법 문제 — 여기서 멈추고 원인을 잡는다.

- [ ] **Step 3: `visitor_mix` 의 합이 `uv` 와 일치하는지 눈으로 확인**

모든 버킷에서 `new_uv + streak_uv + back_uv == uv` 여야 한다. 어긋나면 `lag()` 조건(`prev = bucket - 1` / `prev < bucket - 1`)에 버그가 있다 — `prev is null` 이 두 filter 에서 자동 제외되는 것이 3분할의 전제다.

- [ ] **Step 4: 정답지 문서 작성**

`docs/superpowers/specs/2026-07-29-admin-expected-values.md` 를 만들고 Step 2 출력을 표로 옮긴다. 반드시 포함할 것:

- 실행 시각(쿼리 결과의 `now()` 또는 실행한 시각)과 **그 시각의 오전 10시 롤오버 "오늘" 버킷**
- 어드민 제외 **미적용** 이라는 조건 명시 (앱은 제외 적용 → 값이 조금 작게 나오는 것이 정상)
- `consult_funnel` 3값을 스펙 §6-5 의 628/400/320 과 나란히 놓고 완료율·열람률 비교
- **d4 판독 소견 한 단락** — 재방문율 추세, PV/UV, 봇 비율

- [ ] **Step 5: 커밋**

```bash
git add scripts/admin-expected-values.sql docs/superpowers/specs/2026-07-29-admin-expected-values.md
git commit -m "docs(admin): RPC 전환 정답지 + d4 판독 (raw SQL, cap 무관)"
```

---

## Task 2: `Stat` 컴포넌트에 `sub` prop

**Files:**
- Modify: `components/admin/Stat.tsx:24-37`

`children` 은 값과 같은 줄(flex items-baseline)에 들어가 `Delta` 자리다. 서브라인은 아래 줄이 필요하다.

- [ ] **Step 1: `sub` prop 추가**

`components/admin/Stat.tsx` 의 `Stat` 함수를 교체한다:

```tsx
// sub: 값 아래 한 줄. children(=Delta)은 값과 같은 줄이라 서브라인 자리가 없다.
// 두 화면(대시보드·트래픽)이 같은 표기를 쓰도록 여기 둔다 — 화면마다 복제하면 조용히 갈린다.
export function Stat({ label, value, paren, children, sub }: { label: string; value: string | number; paren?: string; children?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="text-[12px] text-white/60">{label}</div>
      <div className="text-2xl font-bold mt-1 flex items-baseline gap-x-2 flex-wrap">
        <span>
          {value}
          {paren && <span className="text-sm font-normal text-white/50 ml-1.5">({paren})</span>}
        </span>
        {children}
      </div>
      {sub && <div className="text-[12px] text-white/50 mt-1.5">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0. (`sub` 는 optional 이라 기존 호출부 무영향)

- [ ] **Step 3: 커밋**

```bash
git add components/admin/Stat.tsx
git commit -m "feat(admin): Stat 카드에 sub 서브라인 prop"
```

---

## Task 3: 어드민 제외 목록의 배열 반환 함수

**Files:**
- Modify: `lib/admin.ts`

현행 `adminExclusionList()` 는 PostgREST in-리스트 문자열 `"(uuid,uuid)"` 를 반환한다. RPC 는 `uuid[]` 인자가 필요하다. **기존 함수는 미전환 화면이 계속 쓰므로 병렬로 추가한다.**

- [ ] **Step 1: 배열 반환 함수 추가**

`lib/admin.ts` 의 `adminExclusionList()`(32~34행) 바로 아래에 추가한다. 원천은 같은 `ADMIN_IDS` Set 이어야 한다 — 두 함수가 다른 원천을 보면 화면마다 제외가 갈린다.

```ts
/**
 * 어드민 제외 목록을 uuid 배열로. RPC 인자용(`p_exclude uuid[]`).
 *
 * adminExclusionList() 는 PostgREST in-리스트 문자열을 만들지만 RPC 는 배열이 필요하다.
 * 빈 배열이면 SQL 쪽 `user_id <> all('{}')` 가 true 로 자연 동작하므로 호출부의 null 분기가
 * 사라진다 (문자열 버전은 빈 목록에서 null 을 반환해 `if (excl)` 분기가 필요했다).
 */
export function adminExclusionArray(): string[] {
  return [...ADMIN_IDS];
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0 (기존 `adminExclusionList` 는 그대로 남아 미전환 화면이 계속 쓴다)

- [ ] **Step 3: 커밋**

```bash
git add lib/admin.ts
git commit -m "feat(admin): 어드민 제외 목록 배열 반환 함수 (RPC 인자용)"
```

---

## Task 4: 마이그레이션 — traffic RPC 6개

**Files:**
- Create: `supabase/migrations/20260729000000_admin_traffic_aggregates.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 어드민 트래픽 집계 RPC (2026-07-29)
-- 원칙: 어드민 집계는 원본 행을 앱으로 끌어오지 않는다. 반환 행수가 데이터량과 무관하게
-- 고정되므로 Supabase `Max rows` cap 개념 자체가 소멸한다.
-- 설계 정본: docs/superpowers/specs/2026-07-29-admin-aggregation-rpc-and-visitor-mix-design.md
--
-- 재현하는 규칙 4가지 (드리프트 주의):
--  1) 오전 10시 롤오버 — ((created_at + interval '9 hours' - interval '10 hours')::date)
--     ⚠️ /admin/analytics 트렌드와 연애 일일 턴은 KST 자정 기준. 섞지 말 것.
--  2) 봇 제외 is_bot = false. 단 admin_traffic_bot 은 봇 포함이 분모 — 유일한 예외.
--  3) 어드민 제외 — page_views 는 비로그인 행의 user_id 가 NULL 이라 NOT IN 단독은 SQL
--     3값 논리로 비로그인 행을 전멸시킨다. 반드시 (user_id is null or user_id <> all(...)).
--  4) first-touch 귀속 — anon_id 의 가장 이른 값으로 그 방문자의 모든 행을 귀속.

-- ── 유입값 정규화 (JS normalizeEntryValue + DIRECT 폴백을 합친 것) ──
-- {{ad.name}} 형태는 Meta 매크로가 치환되지 않고 리터럴로 도착한 것 = 실제 소재가 아니다.
CREATE OR REPLACE FUNCTION admin_normalize_entry(p_val TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_val IS NULL THEN '(직접/오가닉)'
    WHEN btrim(p_val) ~ '^\{\{.*\}\}$' THEN '(매크로 미치환)'
    ELSE p_val
  END;
$$;

-- ── 1. 일별 UV/PV 추세 ──
-- 날짜 축 0 채우기는 앱이 한다(fillTrafficAxis) — 수집이 끊긴 날을 0 으로 보이게 하는 것이
-- 목적이고, 기존 순수 함수 로직을 재사용하는 편이 안전하다.
CREATE OR REPLACE FUNCTION admin_traffic_trend(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, uv BIGINT, pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ((created_at + interval '9 hours' - interval '10 hours')::date),
         count(DISTINCT anon_id),
         count(*)
  FROM page_views
  WHERE created_at >= p_since
    AND is_bot = false
    AND (user_id IS NULL OR user_id <> ALL(p_exclude))
  GROUP BY 1 ORDER BY 1;
$$;

-- ── 2. 방문자 구성 (신규 / 연속 / 복귀) ──
-- 🔴 prev 계산은 조회창에 의존해선 안 된다. 창 안에서만 lag 하면 ①창 밖에 첫 방문이 있던
--    방문자가 신규로 오분류되고 ②가장 오래된 버킷의 연속/복귀 구분이 전부 틀린다.
--    그래서 lag 를 전체 테이블에 돌린 뒤 창 필터를 나중에 건다.
-- ⚠️ 봇·어드민 제외를 여기서도 동일 적용해야 한다. 안 걸면 봇으로 오분류된 하루나 운영자로
--    돌아본 날이 그 anon_id 의 첫 방문이 되어 실제 사람의 첫 방문이 영원히 "복귀"로 잡힌다.
-- prev IS NULL 은 아래 두 filter 에서 자동 제외되므로 3분할 합 = uv 가 성립한다.
CREATE OR REPLACE FUNCTION admin_traffic_visitor_mix(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (bucket DATE, uv BIGINT, new_uv BIGINT, streak_uv BIGINT, back_uv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH visits AS (
    SELECT DISTINCT anon_id,
           ((created_at + interval '9 hours' - interval '10 hours')::date) AS bucket
    FROM page_views
    WHERE anon_id IS NOT NULL
      AND is_bot = false
      AND (user_id IS NULL OR user_id <> ALL(p_exclude))
  ), lagged AS (
    SELECT anon_id, bucket,
           lag(bucket) OVER (PARTITION BY anon_id ORDER BY bucket) AS prev
    FROM visits
  )
  SELECT bucket,
         count(*),
         count(*) FILTER (WHERE prev IS NULL),
         count(*) FILTER (WHERE prev = bucket - 1),
         count(*) FILTER (WHERE prev < bucket - 1)
  FROM lagged
  WHERE bucket >= ((p_since + interval '9 hours' - interval '10 hours')::date)
  GROUP BY 1 ORDER BY 1;
$$;

-- ── 3. 라우트별 UV·PV + 오늘 열 ──
-- 순위는 PV 내림차순 유지(표시 순서 UV·PV 와 별개). 오늘 값으로 재정렬하면 순위가 매 시간
-- 흔들려 "어느 라우트에서 새는가"를 못 읽는다.
-- "오늘만 활동하고 기간 상위 N 밖인 라우트는 표에 안 나온다" 는 현행 동작을 유지한다.
CREATE OR REPLACE FUNCTION admin_traffic_routes(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_today DATE, p_limit INT DEFAULT 20
)
RETURNS TABLE (path TEXT, uv BIGINT, pv BIGINT, today_uv BIGINT, today_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.path,
         count(DISTINCT v.anon_id),
         count(*),
         count(DISTINCT v.anon_id) FILTER (WHERE ((v.created_at + interval '9 hours' - interval '10 hours')::date) = p_today),
         count(*) FILTER (WHERE ((v.created_at + interval '9 hours' - interval '10 hours')::date) = p_today)
  FROM page_views v
  WHERE v.created_at >= p_since
    AND v.is_bot = false
    AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  GROUP BY v.path
  ORDER BY count(*) DESC, count(DISTINCT v.anon_id) DESC
  LIMIT p_limit;
$$;

-- ── 4. 로그인 전/후 ──
-- 빈 데이터에서도 두 행을 항상 반환한다(화면 표가 사라지지 않게) → segments 를 좌변에 두고 LEFT JOIN.
-- 주의: 같은 anon_id 가 가입 순간 양쪽에 나타나므로 두 UV 합은 전체 UV 보다 클 수 있다(정상).
CREATE OR REPLACE FUNCTION admin_traffic_auth(p_since TIMESTAMPTZ, p_exclude UUID[], p_today DATE)
RETURNS TABLE (segment TEXT, uv BIGINT, pv BIGINT, today_uv BIGINT, today_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.segment,
         count(DISTINCT v.anon_id),
         count(v.id),
         count(DISTINCT v.anon_id) FILTER (WHERE ((v.created_at + interval '9 hours' - interval '10 hours')::date) = p_today),
         count(v.id) FILTER (WHERE ((v.created_at + interval '9 hours' - interval '10 hours')::date) = p_today)
  FROM (VALUES ('guest'), ('member')) AS s(segment)
  LEFT JOIN page_views v
    ON (CASE WHEN v.user_id IS NULL THEN 'guest' ELSE 'member' END) = s.segment
   AND v.created_at >= p_since
   AND v.is_bot = false
   AND (v.user_id IS NULL OR v.user_id <> ALL(p_exclude))
  GROUP BY s.segment
  ORDER BY s.segment;
$$;

-- ── 5. 유입별 (first-touch 귀속) ──
-- p_field: 'landing_variant' 또는 'utm_content'. 두 필드는 독립적으로 first-touch 한다
-- (같은 행일 필요 없음).
-- ⚠️ 창 안 first-touch = 현행 buildEntrySources 동작. 창 밖까지 보도록 "개선"하면
--    before/after 대조가 깨져 검증 자체가 불가능해진다. 개선은 별건.
-- ⚠️ Postgres 에 IGNORE NULLS 가 없어 first_value 대신 array_agg 후 첫 원소를 취한다.
-- anon_id 없는 행은 귀속 불가 → 자기 행 값으로 PV 만 기여(count(DISTINCT anon_id) 가 NULL 을
-- 세지 않으므로 UV 미계상이 자동으로 성립).
-- 🔴 p_limit 이 필수다. 이 RPC 는 반환 행수가 **소재 카디널리티에 비례**하는 4개 중 하나이고,
--    RPC 결과도 PostgREST 를 지나므로 `Max rows` cap 이 그대로 적용된다 — 상한을 안 박으면
--    "RPC 로 바꿨는데 또 조용히 잘리는" 같은 사고가 재발한다. 기본 200 은 현실 소재 수(수십)의
--    훨씬 위이면서 cap(1000+) 의 훨씬 아래다. 상한 도달은 앱이 경고로 드러낸다(조용한 절단 금지).
CREATE OR REPLACE FUNCTION admin_traffic_entry(
  p_since TIMESTAMPTZ, p_exclude UUID[], p_today DATE, p_field TEXT, p_limit INT DEFAULT 200
)
RETURNS TABLE (key TEXT, uv BIGINT, pv BIGINT, today_uv BIGINT, today_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (
    SELECT anon_id,
           created_at,
           ((created_at + interval '9 hours' - interval '10 hours')::date) AS bucket,
           CASE WHEN p_field = 'landing_variant' THEN landing_variant ELSE utm_content END AS val
    FROM page_views
    WHERE created_at >= p_since
      AND is_bot = false
      AND (user_id IS NULL OR user_id <> ALL(p_exclude))
  ), first_touch AS (
    SELECT anon_id,
           (array_remove(array_agg(val ORDER BY created_at), NULL))[1] AS first_val
    FROM src WHERE anon_id IS NOT NULL GROUP BY anon_id
  ), keyed AS (
    SELECT s.anon_id, s.bucket,
           admin_normalize_entry(
             CASE WHEN s.anon_id IS NULL THEN s.val ELSE f.first_val END
           ) AS key
    FROM src s LEFT JOIN first_touch f ON f.anon_id = s.anon_id
  )
  SELECT key,
         count(DISTINCT anon_id),
         count(*),
         count(DISTINCT anon_id) FILTER (WHERE bucket = p_today),
         count(*) FILTER (WHERE bucket = p_today)
  FROM keyed
  GROUP BY key
  -- (직접/오가닉) 은 대개 압도적이라 맨 위에 두면 소재 행이 안 보인다 → 맨 아래로.
  -- (매크로 미치환) 은 내리지 않는다(현행과 동일).
  ORDER BY (key = '(직접/오가닉)'), count(DISTINCT anon_id) DESC, count(*) DESC
  LIMIT p_limit;
$$;

-- ── 6. 봇 비율 (계측 건강성) ──
-- 유일하게 is_bot 필터가 없다 — 봇 포함 전체가 분모여야 비율이 의미를 갖는다.
CREATE OR REPLACE FUNCTION admin_traffic_bot(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (total_pv BIGINT, bot_pv BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*), count(*) FILTER (WHERE is_bot)
  FROM page_views
  WHERE created_at >= p_since
    AND (user_id IS NULL OR user_id <> ALL(p_exclude));
$$;

-- ── 권한: service_role 전용 (게이트는 라우트의 requireAdmin 이 담당) ──
-- 함수는 기본적으로 PUBLIC 에 EXECUTE 가 있으므로 반드시 REVOKE 한다.
REVOKE EXECUTE ON FUNCTION admin_normalize_entry FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_trend FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_visitor_mix FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_routes FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_auth FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_entry FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_traffic_bot FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_normalize_entry TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_trend TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_visitor_mix TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_routes TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_auth TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_entry TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_bot TO service_role;
```

- [ ] **Step 2: 함수 본문을 prod 에서 raw SQL 로 검증 (적용 전)**

마이그레이션을 push 하기 **전에** 각 함수 본문을 인라인 SQL 로 돌려 Task 1 정답지와 대조한다. `p_since` 는 30일 전, `p_exclude` 는 빈 배열, `p_today` 는 Task 1 문서에 기록한 오늘 버킷을 쓴다.

```bash
SUPABASE_PAT=<값> node scripts/run-prod-query.mjs --sql "
with visits as (
  select distinct anon_id, ((created_at + interval '9 hours' - interval '10 hours')::date) as bucket
  from page_views
  where anon_id is not null and is_bot = false
    and (user_id is null or user_id <> all('{}'::uuid[]))
), lagged as (
  select anon_id, bucket, lag(bucket) over (partition by anon_id order by bucket) as prev from visits
)
select bucket, count(*) uv,
       count(*) filter (where prev is null) new_uv,
       count(*) filter (where prev = bucket - 1) streak_uv,
       count(*) filter (where prev < bucket - 1) back_uv
from lagged
where bucket >= ((now() - interval '30 days' + interval '9 hours' - interval '10 hours')::date)
group by 1 order by 1"
```

Expected: Task 1 의 `visitor_mix` 값과 **완전 일치**. 나머지 5개 함수도 같은 방식으로 대조한다(trend / routes / auth / entry ×2 / bot).

⚠️ 불일치가 나오면 스펙 §3 규칙 4가지 중 하나의 드리프트다. 특히 의심할 것: `entry` 의 first-touch 와 `(직접/오가닉)` 정렬 · `auth` 의 LEFT JOIN 이 `count(v.id)` 가 아니라 `count(*)` 로 되어 빈 세그먼트가 0 대신 1 이 되는 실수.

- [ ] **Step 3: dev 에 push 해서 적용**

```bash
git add supabase/migrations/20260729000000_admin_traffic_aggregates.sql
git commit -m "feat(admin): traffic 집계 RPC 6개 — page_views 원본 행 미수신"
git push origin dev
```

- [ ] **Step 4: Supabase dev Workflow 적용 확인**

GitHub Actions(Supabase Git sync) 로그가 SUCCESS 인지 확인한다. 실패면 SQL 문법 오류이므로 여기서 고친다.

- [ ] **Step 5: 🔴 anon 키로 RPC 호출 → 거부되는지 실검증**

`security definer` 함수는 **호출자 권한을 무시하고 소유자 권한으로 실행**된다. 함수는 기본적으로 `PUBLIC` 에 `EXECUTE` 가 있으므로, `REVOKE` 가 실제로 먹지 않았다면 **anon 키만으로 어드민 집계 전체를 읽을 수 있다.** 마이그레이션에 `REVOKE` 를 썼다는 것과 그게 적용됐다는 것은 다르다 — 반드시 확인한다.

```bash
# .env.local 의 dev anon 키로 직접 호출 (dev 프로젝트 URL 사용)
source .env.local 2>/dev/null
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/admin_traffic_visitor_mix" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_since":"2026-01-01T00:00:00Z","p_exclude":[]}'
```

Expected: **`404`**(PostgREST 는 실행 권한 없는 함수를 스키마에 노출하지 않아 404 로 답한다) 또는 `401`/`403`.
🔴 **`200` 이 나오면 즉시 중단.** `REVOKE` 가 적용되지 않았다는 뜻이고, 어드민 집계가 공개된 상태다. 마이그레이션의 `REVOKE EXECUTE ON FUNCTION <name> FROM PUBLIC` 을 함수 시그니처까지 명시하는 형태로 고쳐 재적용한다(오버로드가 있으면 이름만으로는 대상이 모호해 실패할 수 있다).

7개 함수 중 **최소 3개**(`admin_traffic_visitor_mix`·`admin_traffic_entry`·`admin_traffic_bot`)를 같은 방식으로 확인한다. `admin_traffic_entry` 는 인자가 5개라 오버로드 모호성 위험이 가장 크다.

- [ ] **Step 6: dev DB 에서 함수 존재 확인**

```bash
SUPABASE_PAT=<값> SUPABASE_PROJECT_REF=vtdmxdcetziileynjaxi node scripts/run-prod-query.mjs --sql "
select proname from pg_proc where proname like 'admin_traffic%' or proname = 'admin_normalize_entry' order by 1"
```

Expected: 7개 함수명 (`admin_normalize_entry`, `admin_traffic_auth`, `admin_traffic_bot`, `admin_traffic_entry`, `admin_traffic_routes`, `admin_traffic_trend`, `admin_traffic_visitor_mix`)

---

## Task 5: 순수 함수 — 방문자 구성 표시 파생값

**Files:**
- Modify: `lib/analytics/traffic.ts` (파일 끝에 섹션 추가)
- Test: `lib/analytics/traffic.test.ts`

집계는 SQL 이 한다. 앱에 남는 건 **표시용 파생값**뿐이다 — 재방문율, PV/UV, 날짜 축 0 채우기.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`lib/analytics/traffic.test.ts` 끝에 추가한다. 파일 상단 import 에 `buildVisitorMix`, `pickTodayVisitorMix`, `fillTrafficAxis`, `withPvPerUv` 를 더한다.

```ts
// ── 방문자 구성 (RPC 결과의 표시 파생값) ──────────────────────────────────────

test("buildVisitorMix — 재방문율은 (연속+복귀)/UV, 소수 1자리", () => {
  const out = buildVisitorMix([
    { date: "2026-07-28", uv: 48, newUv: 42, streakUv: 6, backUv: 0 },
  ]);
  assert.equal(out[0].returningUv, 6);
  assert.equal(out[0].returningPct, 12.5);
});

test("buildVisitorMix — 3분할 합이 UV 와 같다는 SQL 계약을 문서화한다", () => {
  // prod 실측값(2026-07-27 버킷). SQL 이 배타적·완전을 보장하므로 앱은 합을 재계산하지 않는다.
  const r = { date: "2026-07-27", uv: 57, newUv: 52, streakUv: 3, backUv: 2 };
  assert.equal(r.newUv + r.streakUv + r.backUv, r.uv);
  assert.equal(buildVisitorMix([r])[0].returningPct, 8.8);
});

test("buildVisitorMix — UV 0 이면 재방문율 0 (0 나누기 없음)", () => {
  const out = buildVisitorMix([
    { date: "2026-07-25", uv: 0, newUv: 0, streakUv: 0, backUv: 0 },
  ]);
  assert.equal(out[0].returningPct, 0);
});

test("buildVisitorMix — 빈 배열은 빈 배열 (throw 없음)", () => {
  assert.deepEqual(buildVisitorMix([]), []);
});

test("pickTodayVisitorMix — 마지막(최신) 점을 고른다", () => {
  const mix = buildVisitorMix([
    { date: "2026-07-27", uv: 57, newUv: 52, streakUv: 3, backUv: 2 },
    { date: "2026-07-28", uv: 48, newUv: 42, streakUv: 6, backUv: 0 },
  ]);
  assert.equal(pickTodayVisitorMix(mix).date, "2026-07-28");
});

test("pickTodayVisitorMix — 빈 배열이어도 0 인 점을 준다 (화면이 깨지지 않게)", () => {
  const t = pickTodayVisitorMix([]);
  assert.equal(t.uv, 0);
  assert.equal(t.newUv, 0);
  assert.equal(t.returningPct, 0);
});

// ── RPC 행 → 화면용 변환 ──────────────────────────────────────────────────────

test("fillTrafficAxis — 수집이 없던 날도 0 으로 축에 남는다", () => {
  const out = fillTrafficAxis(
    [{ date: "2026-07-28", uv: 48, pv: 411 }],
    3,
    "2026-07-28"
  );
  assert.deepEqual(out.map((p) => p.date), ["2026-07-26", "2026-07-27", "2026-07-28"]);
  assert.deepEqual(out.map((p) => p.pv), [0, 0, 411]);
});

test("fillTrafficAxis — 축 밖(조회 경계 걸침) 날짜는 버린다", () => {
  const out = fillTrafficAxis(
    [
      { date: "2026-07-20", uv: 9, pv: 9 },
      { date: "2026-07-28", uv: 48, pv: 411 },
    ],
    2,
    "2026-07-28"
  );
  assert.equal(out.length, 2);
  assert.equal(out.find((p) => p.date === "2026-07-20"), undefined);
});

test("withPvPerUv — PV/UV 는 소수 1자리, UV 0 이면 0", () => {
  const out = withPvPerUv([
    { path: "/", uv: 48, pv: 411, todayUv: 48, todayPv: 411 },
    { path: "/x", uv: 0, pv: 3, todayUv: 0, todayPv: 3 },
  ]);
  assert.equal(out[0].pvPerUv, 8.6);
  assert.equal(out[1].pvPerUv, 0);
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `node --import tsx --test lib/analytics/traffic.test.ts`
Expected: FAIL — `buildVisitorMix is not a function` 계열 에러 (기존 21개는 계속 통과)

- [ ] **Step 3: 구현**

`lib/analytics/traffic.ts` 파일 끝에 추가한다:

```ts
// ── 6. 방문자 구성 (신규 / 연속 / 복귀) ──────────────────────────────────────
//
// 집계는 SQL(admin_traffic_visitor_mix)이 한다. 방문자의 "직전 방문 버킷"을 알아야 하고 그건
// 조회창 밖까지 봐야 나오므로, 원본 행을 앱으로 받는 방식으로는 계산 자체가 불가능하다.
// 여기 있는 건 SQL 결과에 표시용 파생값을 붙이는 순수 함수뿐이다.
//
// 정의 (SQL 이 보장): 신규 = 직전 방문 없음 / 연속 = 직전 방문이 어제 버킷 / 복귀 = 그보다 전.
// 배타적·완전하므로 세 값의 합은 그 버킷 UV 와 같다.

export type VisitorMixRow = {
  date: string; // 'YYYY-MM-DD' (오전 10시 롤오버 버킷)
  uv: number;
  newUv: number;
  streakUv: number;
  backUv: number;
};

export type VisitorMixPoint = VisitorMixRow & {
  returningUv: number;
  /** (연속+복귀)/UV, 소수 1자리. 유입 규모에 중립적이라 "리텐션이 생겼나"의 판독 지표다. */
  returningPct: number;
};

export function buildVisitorMix(rows: VisitorMixRow[]): VisitorMixPoint[] {
  return rows.map((r) => {
    const returningUv = r.streakUv + r.backUv;
    return { ...r, returningUv, returningPct: pct1(returningUv, r.uv) };
  });
}

/**
 * 추세의 마지막 점 = 오늘 버킷. 상단 카드 서브라인용.
 * 빈 배열에서도 0 인 점을 반환한다 (수집 초기·조회 실패에 화면이 깨지지 않게).
 */
export function pickTodayVisitorMix(mix: VisitorMixPoint[]): VisitorMixPoint {
  return (
    mix[mix.length - 1] ?? {
      date: "",
      uv: 0,
      newUv: 0,
      streakUv: 0,
      backUv: 0,
      returningUv: 0,
      returningPct: 0,
    }
  );
}

// ── 7. RPC 행 → 화면용 변환 ─────────────────────────────────────────────────
//
// RPC 는 데이터가 있는 날만 반환한다. 날짜 축을 앱에서 채우는 이유는 buildTrafficTrend 와 같다 —
// 수집이 끊긴 날이 행 자체로 사라지면 그래프가 거짓말을 한다.

/** RPC 의 일별 행에 날짜 축을 채운다(없는 날 0). 축 밖 날짜는 버린다. */
export function fillTrafficAxis(
  rows: TrafficPoint[],
  days: number,
  todayBucket: string
): TrafficPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const base = new Date(`${todayBucket}T00:00:00Z`);
  const out: TrafficPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    const hit = byDate.get(d);
    out.push({ date: d, uv: hit?.uv ?? 0, pv: hit?.pv ?? 0 });
  }
  return out;
}

/** 라우트 행에 PV/UV(재방문 강도)를 붙인다. SQL 로 내리지 않는 이유: 순수 표시 파생값이다. */
export function withPvPerUv<T extends { uv: number; pv: number }>(rows: T[]): (T & { pvPerUv: number })[] {
  return rows.map((r) => ({
    ...r,
    pvPerUv: r.uv ? Math.round((r.pv / r.uv) * 10) / 10 : 0,
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --import tsx --test lib/analytics/traffic.test.ts`
Expected: PASS, 총 30개 (기존 21 + 신규 9)

- [ ] **Step 5: 커밋**

```bash
git add lib/analytics/traffic.ts lib/analytics/traffic.test.ts
git commit -m "feat(admin): 방문자 구성 표시 파생값 순수 함수 + 테스트 9"
```

---

## Task 6: traffic 라우트를 RPC 로 전환

**Files:**
- Modify: `app/api/admin/traffic/route.ts` (전면 재작성)

- [ ] **Step 1: 라우트 재작성**

```ts
// app/api/admin/traffic/route.ts — page_views 기반 UV/PV.
// 지표 5개: 일별 추세 / 방문자 구성 / 라우트별 / 로그인 전후 / 유입별. 봇 비율은 계측 건강성 한 줄.
//
// 집계는 전부 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은 page_views
// 원본을 .limit(100000) 으로 받아 앱에서 집계했는데, Supabase `Max rows`(서버 강제 상한)가
// 그 limit 을 조용히 덮어써 30일 UV/PV 가 53% 유실됐다(2026-07-28 사고).
// 봇 제외 · 어드민 제외(3값 논리) · 오전 10시 롤오버 · first-touch 귀속 규칙은 모두 RPC 안에 있다.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { adminDaysAgoKstIso, adminKstDate } from "@/lib/admin-time";
import {
  buildVisitorMix,
  fillTrafficAxis,
  withPvPerUv,
  type TrafficPoint,
  type VisitorMixRow,
} from "@/lib/analytics/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = adminDaysAgoKstIso(days - 1);
  const todayBucket = adminKstDate(new Date().toISOString());
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  // 유입 RPC 는 반환 행수가 소재 카디널리티 비례라 상한을 명시한다. 상한에 닿으면 아래에서
  // truncated 플래그로 드러낸다 — 조용히 잘리는 것이 2026-07-28 cap 사고의 본질이었다.
  const ENTRY_LIMIT = 200;

  const [trend, mix, routes, auth, variants, contents, bot] = await Promise.all([
    supa.rpc("admin_traffic_trend", { p_since: since, p_exclude }),
    supa.rpc("admin_traffic_visitor_mix", { p_since: since, p_exclude }),
    supa.rpc("admin_traffic_routes", { p_since: since, p_exclude, p_today: todayBucket }),
    supa.rpc("admin_traffic_auth", { p_since: since, p_exclude, p_today: todayBucket }),
    supa.rpc("admin_traffic_entry", { p_since: since, p_exclude, p_today: todayBucket, p_field: "landing_variant", p_limit: ENTRY_LIMIT }),
    supa.rpc("admin_traffic_entry", { p_since: since, p_exclude, p_today: todayBucket, p_field: "utm_content", p_limit: ENTRY_LIMIT }),
    supa.rpc("admin_traffic_bot", { p_since: since, p_exclude }),
  ]);

  const failed = [trend, mix, routes, auth, variants, contents, bot].find((r) => r.error);
  if (failed) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // RPC 는 snake_case 컬럼을 준다 → 화면 타입(camelCase)으로 옮긴다.
  const trendRows: TrafficPoint[] = (trend.data ?? []).map(
    (r: { bucket: string; uv: number; pv: number }) => ({ date: r.bucket, uv: Number(r.uv), pv: Number(r.pv) })
  );
  const mixRows: VisitorMixRow[] = (mix.data ?? []).map(
    (r: { bucket: string; uv: number; new_uv: number; streak_uv: number; back_uv: number }) => ({
      date: r.bucket,
      uv: Number(r.uv),
      newUv: Number(r.new_uv),
      streakUv: Number(r.streak_uv),
      backUv: Number(r.back_uv),
    })
  );
  // RPC 4개가 같은 (uv, pv, today_uv, today_pv) 4컬럼을 주고 식별 컬럼만 다르다.
  // 계산된 키(`[key]: r[key]`)로 일반화하면 TS 가 필드명을 좁히지 못해 타입 에러가 나므로,
  // 숫자 4개만 공통 처리하고 식별 컬럼은 호출부에서 명시한다.
  type CountRow = { uv: number; pv: number; today_uv: number; today_pv: number };
  const counts = (r: CountRow) => ({
    uv: Number(r.uv),
    pv: Number(r.pv),
    todayUv: Number(r.today_uv),
    todayPv: Number(r.today_pv),
  });
  const routeRows = ((routes.data ?? []) as (CountRow & { path: string })[]).map((r) => ({
    path: r.path,
    ...counts(r),
  }));
  const authRows = ((auth.data ?? []) as (CountRow & { segment: string })[]).map((r) => ({
    segment: r.segment,
    ...counts(r),
  }));
  const entryRows = (rows: unknown) =>
    ((rows ?? []) as (CountRow & { key: string })[]).map((r) => ({ key: r.key, ...counts(r) }));

  const botRow = (bot.data ?? [])[0] ?? { total_pv: 0, bot_pv: 0 };
  const totalPv = Number(botRow.total_pv);
  const botPv = Number(botRow.bot_pv);

  return NextResponse.json({
    days,
    bot: { totalPv, botPv, botPct: totalPv ? Math.round((botPv / totalPv) * 1000) / 10 : 0 },
    trend: fillTrafficAxis(trendRows, days, todayBucket),
    // 방문자 구성은 축을 채우지 않는다 — 수집 전 날짜를 0 으로 채우면 "그날 방문자 0" 과
    // "그날은 아직 수집 전" 이 구분되지 않아 재방문율이 0 으로 희석된다.
    visitorMix: buildVisitorMix(mixRows),
    routes: withPvPerUv(routeRows),
    auth: authRows,
    entry: {
      variants: entryRows(variants.data),
      contents: entryRows(contents.data),
      // 상한 도달 = 표가 전부를 보여주지 못한다는 뜻. 화면이 이걸 한 줄로 알린다.
      truncated:
        (variants.data ?? []).length >= ENTRY_LIMIT ||
        (contents.data ?? []).length >= ENTRY_LIMIT,
    },
  });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0. `withToday` 의 반환 타입이 화면 타입(`WithToday<RouteRow>` 등)과 안 맞으면 화면 쪽(Task 7)에서 맞춘다.

- [ ] **Step 3: dev 데이터로 응답 확인**

로컬 dev 서버를 띄우고 어드민 쿠키로 호출한다(어드민 쿠키 주입 방법은 기존 관행 참조 — 임시 `ADMIN_USER_IDS` + HMAC 쿠키, 검증 후 원복).

Run: `npm run dev` 후 `/api/admin/traffic?days=30` 호출
Expected: `trend`(30점) · `visitorMix` · `routes` · `auth`(2행) · `entry` · `bot` 이 모두 존재. `error` 없음.

- [ ] **Step 4: 산술 검증 — 3분할 합 = UV**

응답의 `visitorMix` 각 점에서 `newUv + streakUv + backUv === uv` 인지 확인한다. 어긋나면 RPC 버그다.

- [ ] **Step 5: 커밋**

```bash
git add app/api/admin/traffic/route.ts
git commit -m "refactor(admin): traffic 집계를 RPC 로 — 원본 행 미수신 + 방문자 구성 추가"
```

---

## Task 7: traffic 화면 — 오늘 카드 서브라인 + 방문자 구성 섹션

**Files:**
- Modify: `app/admin/traffic/page.tsx`

- [ ] **Step 1: import 와 데이터 수신 추가**

`app/admin/traffic/page.tsx` 상단 import 에 추가한다:

```tsx
import {
  buildVisitorMix,
  pickTodayVisitorMix,
  pickTodayYesterday,
} from "@/lib/analytics/traffic";
import type { VisitorMixPoint } from "@/lib/analytics/traffic";
```

`TrafficPage` 안, `const { today, yesterday } = pickTodayYesterday(trend);` 바로 위에 추가한다:

```tsx
  const visitorMix: VisitorMixPoint[] = data?.visitorMix ?? [];
  // 오늘 카드 서브라인 — 방문자 구성의 마지막 점이 오늘 버킷.
  const mixToday = pickTodayVisitorMix(visitorMix);
```

⚠️ `data?.visitorMix` 는 이미 라우트에서 `buildVisitorMix` 를 거쳐 `returningPct` 가 붙어 온다. 화면에서 다시 `buildVisitorMix` 를 호출하지 말 것(이중 적용은 무해하지만 계산 위치가 두 곳으로 갈린다). import 한 `buildVisitorMix` 가 쓰이지 않으면 import 에서 뺀다.

- [ ] **Step 2: 오늘 UV 카드에 서브라인**

기존 `<Stat label="오늘 UV" …>` 블록을 교체한다:

```tsx
          <Stat
            label="오늘 UV"
            value={today.uv.toLocaleString()}
            sub={
              mixToday.uv > 0 ? (
                <>
                  신규 {mixToday.newUv.toLocaleString()} · 연속 {mixToday.streakUv.toLocaleString()} ·
                  복귀 {mixToday.backUv.toLocaleString()} · 재방문 {mixToday.returningPct}%
                </>
              ) : undefined
            }
          >
            <Delta today={today.uv} yesterday={yesterday.uv} />
          </Stat>
```

- [ ] **Step 3: "방문자 구성" 섹션 추가**

기존 `일별 UV / PV` 섹션 **바로 아래**에 새 `<section>` 을 넣는다:

```tsx
      <section>
        <h2 className="text-sm text-white/60 mb-3">
          방문자 구성{" "}
          <span className="text-white/40 text-xs">
            (신규 = 기록상 첫 방문 · 연속 = 어제도 왔고 오늘도 · 복귀 = 며칠 만에 돌아옴 ·
            셋의 합 = 그날 UV)
          </span>
        </h2>
        <LineChart
          labels={visitorMix.map((p) => p.date)}
          series={[
            { label: "신규", color: "#E8C26A", values: visitorMix.map((p) => p.newUv) },
            { label: "연속", color: "#6EE7B7", values: visitorMix.map((p) => p.streakUv) },
            { label: "복귀", color: "#B8A8D8", values: visitorMix.map((p) => p.backUv) },
          ]}
        />
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-[13px] md:max-w-2xl">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-1">날짜</th>
                <th>UV</th>
                <th>신규</th>
                <th>연속</th>
                <th>복귀</th>
                <th className="border-l border-white/15 pl-2 text-white/70">재방문율</th>
              </tr>
            </thead>
            <tbody>
              {/* 최신순 — 순위표가 아니라 날짜표라 최신이 위가 맞다 */}
              {[...visitorMix].reverse().slice(0, 14).map((p) => (
                <tr key={p.date} className="border-t border-white/10">
                  <td className="py-1.5 tabular-nums">{p.date.slice(5)}</td>
                  <td className="tabular-nums">{p.uv.toLocaleString()}</td>
                  <td className="tabular-nums">{p.newUv.toLocaleString()}</td>
                  <td className="tabular-nums">{p.streakUv.toLocaleString()}</td>
                  <td className="tabular-nums">{p.backUv.toLocaleString()}</td>
                  <td className="border-l border-white/15 pl-2 tabular-nums">{p.returningPct}%</td>
                </tr>
              ))}
              {visitorMix.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-2 text-white/30">
                    데이터 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-white/30 mt-2">
          차트는 최근 {days}일 전체, 표는 최근 14일. · 2026-07-25 이전 방문 기록이 없어(비콘
          배포일) 수집 초기 며칠은 신규가 과대 집계된다. · 쿠키 삭제 · 시크릿창 · 기기 변경은
          재방문을 신규로 세므로 재방문은 과소 추정이다.
        </p>
      </section>
```

- [ ] **Step 4: 유입 표 상한 도달 경고**

`TrafficPage` 안에 추가한다:

```tsx
  const entryTruncated: boolean = data?.entry?.truncated ?? false;
```

그리고 기존 "유입별" 섹션의 `<p className="text-[11px] text-white/30 mt-3">` 바로 위에 넣는다:

```tsx
        {entryTruncated && (
          <p className="text-[12px] text-amber-300/80 mt-3">
            ⚠️ 소재 종수가 조회 상한(200)에 닿아 표가 전부를 보여주지 못한다. 상한을 올리거나
            소재 키를 정리할 것 — 조용히 잘리지 않게 이 줄을 띄운다.
          </p>
        )}
```

**왜 이게 필요한가**: 2026-07-28 사고의 본질은 "잘렸다"가 아니라 **"잘린 걸 아무도 몰랐다"** 였다. 상한을 박는 것과 상한 도달을 드러내는 것은 한 쌍이다.

- [ ] **Step 5: 타입 체크 + 화면 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0

`/admin/traffic` 을 열어 확인:
- 오늘 UV 카드에 "신규 N · 연속 N · 복귀 N · 재방문 N%" 서브라인
- "방문자 구성" 섹션에 3선 차트 + 표
- 표의 각 행에서 `신규 + 연속 + 복귀 = UV` (눈으로 산술 확인)
- 기존 표 3개(라우트·로그인·유입)가 그대로 렌더

- [ ] **Step 6: 커밋**

```bash
git add app/admin/traffic/page.tsx
git commit -m "feat(admin): 트래픽 화면에 방문자 구성 섹션 + 오늘 카드 서브라인"
```

---

## Task 8: 대시보드를 `admin_traffic_trend` 로 전환 + UV 카드 서브라인

**Files:**
- Modify: `app/admin/page.tsx:117-131` (page_views 조회) · `:191-193` (UV 카드) · `:157-158` (반환 객체)

대시보드의 `page_views` 조회는 traffic 라우트와 **동일 select·동일 필터·동일 순수 함수**다(창만 2일). `admin_traffic_trend` 를 `p_since` 만 바꿔 재사용하면 중복이 사라진다.

- [ ] **Step 1: 현재 구현 확인**

Run: `sed -n '110,160p' app/admin/page.tsx`
목적: `pv` 변수가 어떻게 만들어져 `today`/`yesterday` 에 들어가는지, 반환 객체 필드명을 정확히 파악.

- [ ] **Step 2: page_views 조회를 RPC 로 교체**

`app/admin/page.tsx` 의 `page_views` 조회 블록(`.from("page_views")` … `.limit(100000)` 과 그 뒤 `buildTrafficTrend` 호출)을 교체한다. `yesterday` 는 이 파일이 이미 쓰는 "어제 시작" 변수다(page.tsx:123 `.gte("created_at", yesterday)`):

```tsx
  // 오늘/어제 UV·PV + 방문자 구성 — /admin/traffic 과 같은 RPC 를 창만 좁혀 재사용한다.
  // 이전 구현은 page_views 원본을 .limit(100000) 으로 받았는데 Supabase `Max rows` 가 그걸
  // 덮어써 조용히 잘렸다(2026-07-28 사고). 집계는 Postgres 가 한다.
  const [trendRes, mixRes] = await Promise.all([
    supa.rpc("admin_traffic_trend", { p_since: yesterday, p_exclude: adminExclusionArray() }),
    supa.rpc("admin_traffic_visitor_mix", { p_since: yesterday, p_exclude: adminExclusionArray() }),
  ]);
  const pv = pickTodayYesterday(
    fillTrafficAxis(
      (trendRes.data ?? []).map((r: { bucket: string; uv: number; pv: number }) => ({
        date: r.bucket,
        uv: Number(r.uv),
        pv: Number(r.pv),
      })),
      2,
      adminKstDate(new Date().toISOString())
    )
  );
  const mixToday = pickTodayVisitorMix(
    buildVisitorMix(
      (mixRes.data ?? []).map(
        (r: { bucket: string; uv: number; new_uv: number; streak_uv: number; back_uv: number }) => ({
          date: r.bucket,
          uv: Number(r.uv),
          newUv: Number(r.new_uv),
          streakUv: Number(r.streak_uv),
          backUv: Number(r.back_uv),
        })
      )
    )
  );
```

import 를 정리한다 — `buildTrafficTrend` 대신 `fillTrafficAxis`·`pickTodayVisitorMix`·`buildVisitorMix` 를 쓰고, `adminExclusionArray` 를 `@/lib/admin` 에서 가져온다. `buildTrafficTrend` 가 이 파일에서 더 쓰이지 않으면 import 에서 뺀다(**`lib/analytics/traffic.ts` 의 함수 자체는 지우지 않는다** — 테스트 자산이다).

⚠️ **`p_since` 는 어제 시작이지만 `admin_traffic_visitor_mix` 의 `prev` 는 전체 테이블 기준**이므로, 2일 창에서도 "그제 왔던 사람"이 연속으로 정확히 잡힌다. 이게 RPC 로 옮긴 실질 이득이다 — 이전 구조로는 2일치 행만 받아 계산이 불가능했다.

- [ ] **Step 3: 반환 객체에 방문자 구성 추가**

Step 1 에서 확인한 반환 객체의 `today` 에 필드를 더한다:

```tsx
    today: { uv: pv.today.uv, pv: pv.today.pv, newUv: mixToday.newUv, returningUv: mixToday.returningUv, newUsers: tu.count ?? 0, /* …기존 필드 그대로… */ },
```

- [ ] **Step 4: UV 카드에 서브라인**

기존 `<Stat label="UV" …>` 블록을 교체한다:

```tsx
          <Stat
            label="UV"
            value={s.today.uv.toLocaleString()}
            sub={
              s.today.uv > 0 ? (
                <>
                  신규 {s.today.newUv.toLocaleString()} · 재방문 {s.today.returningUv.toLocaleString()}
                </>
              ) : undefined
            }
          >
            <Delta today={s.today.uv} yesterday={s.yesterday.uv} />
          </Stat>
```

- [ ] **Step 5: 타입 체크 + 화면 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0

`/admin` 을 열어 UV 카드에 "신규 N · 재방문 M" 이 보이고, **`신규 + 재방문 = UV`** 인지 확인. 그리고 `/admin` 의 UV 와 `/admin/traffic` 의 오늘 UV 가 **같은 값**이어야 한다(같은 RPC·같은 버킷).

- [ ] **Step 6: 커밋**

```bash
git add app/admin/page.tsx
git commit -m "refactor(admin): 대시보드 page_views 를 traffic RPC 재사용으로 + UV 서브라인"
```

---

## Task 9: prod 검증 + 정답지 대조

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 + 타입 체크**

```bash
node --import tsx --test lib/**/*.test.ts qa/*.test.ts
npx tsc --noEmit
```
Expected: 전부 통과, 타입 에러 0

- [ ] **Step 2: dev push 후 Preview 확인**

```bash
git push origin dev
```
`dev.byeolkongtalk.com/admin/traffic` 과 `/admin` 을 열어 Task 7·8 의 화면 확인 항목을 다시 본다(로컬과 달리 실제 Vercel 런타임).

- [ ] **Step 3: main 머지**

```bash
git checkout main && git pull && git merge dev && git push origin main
```
⚠️ 로컬 `main` ref 는 항상 stale 하니 `git pull` 을 빠뜨리지 말 것.

- [ ] **Step 4: Supabase main Workflow 확인**

GitHub Actions 로그가 SUCCESS 인지 확인. 실패하면 prod RPC 가 없어 어드민이 500 이 된다.

- [ ] **Step 5: 🔴 prod 화면 ↔ 정답지 대조 (이 플랜의 최종 관문)**

Task 1 정답지를 **같은 시각 기준으로 다시 뜨고**(창이 밀렸으므로) prod 어드민 화면과 대조한다:

```bash
SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/admin-expected-values.sql
```

대조 항목:

| 항목 | 기대 |
|---|---|
| `/admin/traffic` 일별 UV/PV | 정답지 `trend` 와 일치 (어드민 제외분만 차이) |
| `/admin/traffic` 방문자 구성 | 정답지 `visitor_mix` 와 일치 |
| `/admin/traffic` 봇 비율 | 정답지 `bot` 과 일치 |
| `/admin/traffic` 라우트 상위 20 | 정답지 `routes` 와 순서·값 일치 |
| `/admin/traffic` 로그인 전/후 | 정답지 `auth` 와 일치 |
| `/admin` UV | `/admin/traffic` 오늘 UV 와 **동일** |
| 3분할 합 | 모든 행에서 `신규+연속+복귀 = UV` |

⚠️ **정답지는 어드민 제외 미적용**이라 화면 값이 조금 작은 것이 정상이다. 차이가 어드민 활동량을 넘어서면 드리프트다 — 스펙 §3 규칙 4가지를 순서대로 의심한다.

- [ ] **Step 6: 정답지 문서에 검증 결과 append**

`docs/superpowers/specs/2026-07-29-admin-expected-values.md` 에 "전환 후 대조 결과" 절을 추가하고 위 표를 채운다. 커밋:

```bash
git add docs/superpowers/specs/2026-07-29-admin-expected-values.md
git commit -m "docs(admin): 플랜 A 전환 후 정답지 대조 결과"
```

- [ ] **Step 7: `/admin/errors` 확인**

배포 직후 새 에러가 없는지 본다. `admin_traffic_*` 관련 500 이 있으면 즉시 조사. 기존 "설계된 정상 신호"(중복차단 warn·카카오 -101 info)는 버그가 아니다.

---

## 완료 조건

- [ ] `/admin/traffic` 과 `/admin` 이 `page_views` 원본 행을 **한 행도** 받지 않는다 (`.from("page_views")` 가 두 파일에서 사라졌다)
- [ ] 방문자 구성 3분할이 모든 행에서 합 = UV
- [ ] prod 화면 값이 raw SQL 정답지와 일치 (어드민 제외분 차이만)
- [ ] **anon 키로 RPC 호출 시 200 이 아니다** (Task 4 Step 5 — REVOKE 가 실제로 먹었는지)
- [ ] `node --import tsx --test lib/analytics/traffic.test.ts` 30개 통과
- [ ] `npx tsc --noEmit` 클린

**배포 규율**: 창 중간 마이그레이션 예외를 2026-07-29 사용자가 이 작업에 한해 승인했다(스펙 개요 참조). prod 머지까지 이번 판에 끝낸다 — `/admin/traffic` cap 재발 예상이 **2026-08-11** 이라 d14 슬롯(8/9)까지 미루면 여유가 이틀뿐이다.

**플랜 A 완료 후에도 `Max rows` 는 아직 되돌리지 않는다** — 나머지 화면(플랜 B)이 여전히 cap 에 의존한다. 원복은 플랜 B 마지막 단계다.
