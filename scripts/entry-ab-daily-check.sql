-- 입구 반반(A/B) — 그룹별 일일 고장 감시. 🔴 판정이 아니다: 숫자가 앞서든 뒤지든 2주 전엔 멈추지 않는다
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/entry-ab-daily-check.sql
-- 스펙: docs/superpowers/specs/2026-10-11-타로-로그인전-맛보기-design.md §7
--
-- ▶ ENTRY_AB='split' prod 배포 뒤 첫 실행 전에 params 의 deploy_at 을 실제 배포 시각(KST)으로 바꾼다. 비어 있으면 경고만 나온다.
-- 그룹: 익명 쿠키(anon_id) 마지막 글자 짝수(0 2 4 6 8 a c e) = new, 홀수 = old — 앱의 entryArmOf(anonId) 와 같은 규칙
-- 멈춰야 하는 신호(고장일 때만 멈춘다):
--   pending_missing 이 날마다 이어진다         → 로그인·결제 뒤 복원 실패(저장 유실 · 다른 브라우저 귀환 급증)
--   daily 에서 한쪽만 신규 가입 0 이 2일 넘게   → 한쪽 흐름이 막혔다
--   login_fail 이 한쪽에 몰린다                 → 새 흐름 로그인 경로 고장
--   arm_leak 에 행이 있다                       → 옛 그룹이 새 흐름 전용 화면(공개·로그인 창)을 봤다 — 그룹 판정·스위치 고장
--   price_changed 에 행이 있다                  → 로그인 전후 가격 어긋남(MENU_AB 를 승자로 고정하지 않고 켰다)
-- 정의:
--   daily.visitors = 그날 첫 PV 가 생긴 익명 방문자 중 첫 PV utm_source='meta' · 첫 PV 비로그인 · 봇 제외
--   daily.signups  = 배포 뒤 가입한 신규 회원 — 그 회원의 첫 로그인 PV 의 anon_id 로 그룹을 가른다(지인 6명 제외)
--   events         = 배포 뒤 입구 이벤트를 anon_id 그룹 × 날짜 × 이벤트 × 키(flow·surface·via·trigger·reason)로

with
params as (select null::timestamptz as deploy_at),   -- ▶ 예: timestamptz '2026-10-26 21:00:00+09'
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

win as (
  select deploy_at,
         ((now() at time zone 'UTC' + interval '9 hours'))::timestamp(0) as run_at_kst,
         ((deploy_at + interval '14 days' + interval '48 hours') at time zone 'UTC' + interval '9 hours')::timestamp(0)
           as verdict_run_on_or_after_kst,
         case when deploy_at is null then '⚠️ deploy_at 이 비었다 — params 에 ENTRY_AB=split prod 배포 시각(KST)을 넣고 다시 실행' end as warning
  from params
),

first_pv as (
  select distinct on (pv.anon_id) pv.anon_id, pv.created_at as first_at, pv.utm_source, pv.user_id as first_uid
  from page_views pv
  where pv.anon_id is not null and not pv.is_bot
  order by pv.anon_id, pv.created_at
),
visitors as (
  select f.anon_id,
         ((f.first_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when position(lower(right(f.anon_id, 1)) in '02468ace') > 0 then 'new' else 'old' end as arm
  from first_pv f, params
  where params.deploy_at is not null and f.first_at >= params.deploy_at
    and f.utm_source = 'meta' and f.first_uid is null
),

new_users as (
  select u.id as user_id,
         ((u.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         (select pv.anon_id from page_views pv
           where pv.user_id = u.id and pv.anon_id is not null
           order by pv.created_at limit 1) as anon_id
  from users u, params
  where params.deploy_at is not null and u.created_at >= params.deploy_at
    and left(u.id::text, 8) not in (select p from ex)
),
signups as (
  select n.kst_date,
         case when position(lower(right(n.anon_id, 1)) in '02468ace') > 0 then 'new' else 'old' end as arm,
         count(*) as n
  from new_users n where n.anon_id is not null
  group by 1, 2
),
daily as (
  select d.kst_date, d.arm,
         (select count(*) from visitors v where v.kst_date = d.kst_date and v.arm = d.arm) as visitors,
         coalesce((select s.n from signups s where s.kst_date = d.kst_date and s.arm = d.arm), 0) as signups
  from (select distinct kst_date, arm from visitors
        union select distinct kst_date, arm from signups) d
),

ev as (
  select e.event, e.meta, e.anon_id,
         ((e.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when position(lower(right(e.anon_id, 1)) in '02468ace') > 0 then 'new' else 'old' end as arm
  from ui_events e, params
  where params.deploy_at is not null and e.created_at >= params.deploy_at and e.anon_id is not null
    and e.event in ('home_tag_clicked', 'cards_revealed', 'login_sheet_shown', 'login_kakao_clicked',
                    'login_sheet_dismissed', 'login_fail_shown', 'pending_draw_resumed', 'pending_draw_missing',
                    'returning_short_shown')
    and (e.user_id is null or left(e.user_id::text, 8) not in (select p from ex))
),
events as (
  select kst_date, arm, event,
         coalesce(meta->>'flow', meta->>'surface', meta->>'via', meta->>'trigger', meta->>'reason', '-') as key,
         count(*) as n, count(distinct anon_id) as anons
  from ev
  group by 1, 2, 3, 4
),
pending_missing as (
  select kst_date, arm, meta->>'via' as via, count(*) as n
  from ev where event = 'pending_draw_missing'
  group by 1, 2, 3
),
login_fail as (
  select kst_date, arm, meta->>'reason' as reason, count(*) as n
  from ev where event = 'login_fail_shown'
  group by 1, 2, 3
),
arm_leak as (
  select event, count(*) as events, count(distinct anon_id) as anons
  from ev
  where arm = 'old'
    and (event in ('cards_revealed', 'login_sheet_shown', 'login_sheet_dismissed')
         or (event = 'login_kakao_clicked' and meta->>'surface' = 'draw_sheet'))
  group by 1
),
price_changed as (
  select ((l.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date, count(*) as warns
  from error_logs l, params
  where params.deploy_at is not null and l.created_at >= params.deploy_at
    and l.level = 'warn' and left(l.message, 14) = 'PRICE_CHANGED:'
  group by 1
)

select 'window' as metric, to_jsonb(array_agg(x)) as value from win x
union all select 'daily',           to_jsonb(array_agg(d order by d.kst_date, d.arm)) from daily d
union all select 'events',          to_jsonb(array_agg(e order by e.kst_date, e.arm, e.event, e.key)) from events e
union all select 'pending_missing', to_jsonb(array_agg(m order by m.kst_date, m.arm)) from pending_missing m
union all select 'login_fail',      to_jsonb(array_agg(f order by f.kst_date, f.arm)) from login_fail f
union all select 'arm_leak',        to_jsonb(array_agg(a order by a.event)) from arm_leak a
union all select 'price_changed',   to_jsonb(array_agg(p order by p.kst_date)) from price_changed p;
