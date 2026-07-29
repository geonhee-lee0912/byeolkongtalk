-- scripts/admin-expected-values.sql
-- 어드민 집계 RPC 전환의 정답지. Postgres 직결(Management API)이라 Supabase `Max rows` cap 무관.
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/admin-expected-values.sql
--
-- 어드민 제외 미적용 — 스펙 §6-5 고정점(628/400/320)과 같은 조건을 유지한다.
-- 오전 10시 롤오버 버킷: ((created_at + interval '9 hours' - interval '10 hours')::date)
-- KST 자정 버킷:        ((created_at + interval '9 hours')::date)

with
-- ── 0. 실행 시각 · 오늘 버킷 (정답지가 어느 시점 것인지 문서에 박기 위해) ──
meta as (
  select now() as run_at,
         ((now() + interval '9 hours' - interval '10 hours')::date) as today_bucket
),
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
select 'meta' as metric, to_jsonb(array_agg(x)) as value from meta x
union all select 'trend',  to_jsonb(array_agg(t)) from (select * from trend order by bucket) t
union all select 'visitor_mix', to_jsonb(array_agg(m)) from (select * from mix order by bucket) m
union all select 'bot',         to_jsonb(array_agg(b)) from bot b
union all select 'routes',      to_jsonb(array_agg(r)) from routes r
union all select 'auth',        to_jsonb(array_agg(a)) from (select * from auth order by segment) a
union all select 'consult_funnel', to_jsonb(array_agg(f)) from funnel f;
