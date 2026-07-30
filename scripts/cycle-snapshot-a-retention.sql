-- 판정 사이클 스냅샷 A — 방문자 구성 · 획득 소재별 재방문 (어드민 제외)
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/cycle-snapshot-a-retention.sql
--
-- day 0 = 2026-07-26 (픽스 패키지 prod 배포 48f95bb). d4=7/30 · d7=8/2 · d14=8/9 · d21=8/16 · d28=8/23
-- 짝: scripts/admin-expected-values.sql (어드민 **미**제외 = 퍼널 고정점과 조건 일치용 정답지)
--
-- 🔴 방문자 구성은 반드시 어드민 제외로 판독한다. 운영자는 정의상 100% "연속" 방문자라
--    미제외 기준은 재방문율을 통째로 과대평가한다. 2026-07-29 실사고:
--    미제외 3.8/8.8/12.2% → 제외 1.3/5.6/6.5% (절반). 07-28 은 −3 UV 가 전부 "연속"이었다.
-- ⚠️ 어드민 제외는 user_id 기준이라 **운영자의 비로그인·시크릿 브라우징은 못 걸러진다**.
--    그래서 strict 판(그 anon_id 가 한 번이라도 어드민으로 로그인했으면 통째 제외)을 함께 뜬다.
--    두 값이 벌어지면 그 차이가 "운영자 비로그인 혼입"의 상한이다.
-- ⚠️ page_views 는 비로그인 행의 user_id 가 NULL → NOT IN 단독은 3값 논리로 비로그인을 전멸시킨다.
--    반드시 (user_id is null or ...). 화면(admin_traffic_* RPC)과 같은 규칙.
-- 버킷 = 오전 10시 롤오버, UTC 못박음: ((created_at at time zone 'UTC' + interval '9h' - interval '10h')::date)

with
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

meta as (
  select now() as run_at,
         ((now() at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date) as today_bucket,
         ((now() at time zone 'UTC' + interval '9 hours')::date) as today_kst,
         (((now() at time zone 'UTC')::date) - date '2026-07-26') as cycle_day
),

-- ── 어드민으로 한 번이라도 로그인한 anon_id (strict 제외용) ──
admin_anons as (
  select distinct anon_id from page_views
  where anon_id is not null and user_id is not null
    and left(user_id::text, 8) in (select p from ex)
),

-- ── 기본 제외 (화면과 동일 규칙) ──
pv as (
  select * from page_views
  where is_bot = false
    and (user_id is null or left(user_id::text, 8) not in (select p from ex))
),
-- ── strict 제외 (어드민 anon_id 통째 제외) ──
pvs as (
  select * from pv where anon_id is null or anon_id not in (select anon_id from admin_anons)
),

-- ══ 1. 일별 PV/UV — 기본 제외 vs strict 제외 ══
trend_base as (
  select ((created_at at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date) as bucket,
         count(*) as pv, count(distinct anon_id) as uv
  from pv group by 1
),
trend_strict as (
  select ((created_at at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date) as bucket,
         count(*) as pv_strict, count(distinct anon_id) as uv_strict
  from pvs group by 1
),
trend as (
  select b.bucket, b.pv, b.uv,
         coalesce(s.pv_strict,0) as pv_strict, coalesce(s.uv_strict,0) as uv_strict
  from trend_base b left join trend_strict s on s.bucket = b.bucket
),

-- ══ 2. 방문자 구성 (신규/연속/복귀) — lag 은 창 무관 전체 테이블 ══
visits as (
  select distinct anon_id,
         ((created_at at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date) as bucket
  from pv where anon_id is not null
),
lagged as (
  select anon_id, bucket, lag(bucket) over (partition by anon_id order by bucket) as prev from visits
),
mix as (
  select bucket, count(*) as uv,
         count(*) filter (where prev is null)          as new_uv,
         count(*) filter (where prev = bucket - 1)     as streak_uv,
         count(*) filter (where prev < bucket - 1)     as back_uv,
         round(100.0 * count(*) filter (where prev is not null) / nullif(count(*),0), 1) as revisit_pct
  from lagged group by 1
),
-- strict 판
visits_s as (
  select distinct anon_id,
         ((created_at at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date) as bucket
  from pvs where anon_id is not null
),
lagged_s as (
  select anon_id, bucket, lag(bucket) over (partition by anon_id order by bucket) as prev from visits_s
),
mix_s as (
  select bucket, count(*) as uv,
         count(*) filter (where prev is null)      as new_uv,
         count(*) filter (where prev = bucket - 1) as streak_uv,
         count(*) filter (where prev < bucket - 1) as back_uv,
         round(100.0 * count(*) filter (where prev is not null) / nullif(count(*),0), 1) as revisit_pct
  from lagged_s group by 1
),

-- ══ 3. 획득 소재별 재방문 — first-touch 귀속 (admin_traffic_entry 와 동일 규칙) ══
-- 정규화: NULL/'' → (직접/오가닉) · {{...}} → (매크로 미치환)
first_touch as (
  select anon_id,
         (array_remove(array_agg(nullif(utm_content,'') order by created_at, id), null))[1] as first_val
  from pv where anon_id is not null group by anon_id
),
anon_days as (
  select v.anon_id,
         count(*) as visit_days,
         min(v.bucket) as first_bucket,
         max(v.bucket) as last_bucket
  from visits v group by v.anon_id
),
keyed as (
  select ad.anon_id, ad.visit_days, ad.first_bucket,
         case when ft.first_val is null or ft.first_val = '' then '(직접/오가닉)'
              when btrim(ft.first_val) ~ '^\{\{.*\}\}$'      then '(매크로 미치환)'
              else ft.first_val end as src
  from anon_days ad left join first_touch ft on ft.anon_id = ad.anon_id
),
by_source as (
  select src,
         count(*) as visitors,
         count(*) filter (where visit_days >= 2) as revisited,
         round(100.0 * count(*) filter (where visit_days >= 2) / nullif(count(*),0), 1) as revisit_pct,
         -- 돌아올 기회가 있던 사람만(첫 방문이 어제 이전) = 편향 보정
         count(*) filter (where first_bucket < ((now() at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date)) as had_chance,
         count(*) filter (where visit_days >= 2
                            and first_bucket < ((now() at time zone 'UTC' + interval '9 hours' - interval '10 hours')::date)) as had_chance_revisited,
         count(*) filter (where visit_days >= 3) as visited_3plus,
         max(visit_days) as max_days
  from keyed group by src
),

-- ══ 4. 봇 (분모에 봇 포함 — is_bot 필터만의 예외다) ══
-- ⚠️ 어드민 제외는 여기서도 적용한다. 면제 대상은 is_bot 필터뿐이며, 운영자 PV(대량)를 분모에
--    남기면 봇 비중이 아래로 희석되고 화면(admin_traffic_bot)과도 대조가 안 된다.
bot as (
  select count(*) as total_pv, count(*) filter (where is_bot) as bot_pv
  from page_views
  where user_id is null or left(user_id::text, 8) not in (select p from ex)
),

-- ══ 5. 라우트별 상위 25 (어드민 라우트 제외 = 유저 화면만) ══
routes as (
  select path, count(distinct anon_id) as uv, count(*) as pv,
         round(count(*)::numeric / nullif(count(distinct anon_id),0), 2) as pv_per_uv
  from pv where path not like '/admin%'
  group by 1 order by count(*) desc, count(distinct anon_id) desc limit 25
),

-- ══ 6. 로그인 전/후 ══
auth as (
  select case when user_id is null then 'guest' else 'member' end as segment,
         count(distinct anon_id) as uv, count(*) as pv
  from pv group by 1
)

select 'meta' as metric, to_jsonb(array_agg(x)) as value from meta x
union all select 'trend',            to_jsonb(array_agg(t)) from (select * from trend order by bucket) t
union all select 'visitor_mix',      to_jsonb(array_agg(m)) from (select * from mix order by bucket) m
union all select 'visitor_mix_strict', to_jsonb(array_agg(m)) from (select * from mix_s order by bucket) m
union all select 'retention_by_source', to_jsonb(array_agg(b)) from (select * from by_source order by visitors desc) b
union all select 'bot',              to_jsonb(array_agg(b)) from bot b
union all select 'routes_user_only', to_jsonb(array_agg(r)) from routes r
union all select 'auth',             to_jsonb(array_agg(a)) from (select * from auth order by segment) a;
