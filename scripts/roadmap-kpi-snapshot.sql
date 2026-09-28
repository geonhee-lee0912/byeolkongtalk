-- 2026-09-19 흑자 전환 로드맵 v2 — 판정 지표 스냅샷 (가입 코호트 귀속, KST)
-- 사용: SUPABASE_PAT=... node scripts/run-prod-query.mjs scripts/roadmap-kpi-snapshot.sql
-- 창(params.s / params.e)과 제외일(holidays)만 고쳐서 재실행. 지인 6명 제외.
-- 정본 문서: docs/superpowers/plans/2026-09-19-흑자전환-로드맵-v2-별마루배포포함.md §3
with params as (
  select timestamptz '2026-09-01 00:00+09' as s, timestamptz '2026-09-21 00:00+09' as e
), holidays as (
  -- 가입일 기준 제외(공휴일·연휴). 2026 추석 09-24~27 · 개천절 10-03 · 한글날 10-09
  select d::date as d from (values ('2026-09-24'),('2026-09-25'),('2026-09-26'),('2026-09-27'),('2026-10-03'),('2026-10-09')) v(d)
), excl as (
  select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) as k
), u as (
  select u.id, (u.created_at at time zone 'UTC' + interval '9 hours') as ts
  from users u, params p
  where u.created_at >= p.s and u.created_at < p.e
    and left(u.id::text,8) not in (select k from excl)
    and (u.created_at at time zone 'UTC' + interval '9 hours')::date not in (select d from holidays)
), fr as (
  select x.* from (select r.*, row_number() over (partition by user_id order by created_at) as rn from readings r) x where rn = 1
), m as (
  select reading_id,
         count(*) filter (where role = 'user') as ut,
         bool_or(role = 'assistant' and content like '%[END]%') as ended
  from messages group by 1
), p as (
  select user_id, sum(amount_won) as rev, count(*) as n from payments where status = 'completed' group by 1
), sh as (
  select user_id, min(created_at) as t from page_views where path like '/shop%' and user_id is not null group by 1
), ic as (
  select count(*) as n from ui_events e, params pr
  where e.event = 'recharge_sheet_opened' and e.meta->>'source' = 'inchat' and e.created_at >= pr.s and e.created_at < pr.e
), v as (
  select user_id,
         count(distinct (created_at at time zone 'UTC' + interval '9 hours')::date) as days,
         max(created_at at time zone 'UTC' + interval '9 hours') as last_ts
  from page_views where user_id is not null and not coalesce(is_bot, false) group by 1
), g as (
  select u.id, u.ts,
    case when fr.spread_type in ('relationship_5','deep_feelings_5','reunion_5','reunion_deep_7','potential_7','new_love_5','readiness_6','healing_6','checkin_6') then 'premium'
         when fr.spread_type = 'three_card' then 'three'
         when fr.spread_type = 'two_card' then 'two'
         when fr.spread_type = 'one_card' then 'one'
         when fr.id is null then 'none' else 'other' end as grp,
    fr.id as rid, fr.stars_spent, fr.result_viewed_at, m.ut, m.ended,
    p.rev, p.n as pn, sh.t as sh_t, v.days, v.last_ts
  from u
  left join fr on fr.user_id = u.id
  left join m on m.reading_id = fr.id
  left join p on p.user_id = u.id
  left join sh on sh.user_id = u.id
  left join v on v.user_id = u.id
)
select
  (select (s at time zone 'UTC' + interval '9 hours')::date from params) as win_start_kst,
  (select (e at time zone 'UTC' + interval '9 hours')::date from params) as win_end_kst_excl,
  count(*) as users,
  round(100.0 * count(rid) / count(*), 1) as first_reading_pct,
  -- P1: 첫 스프레드가 프리미엄(5장+)인 비중 (결제율은 정의상 100%)
  round(100.0 * count(*) filter (where grp = 'premium') / count(*), 1) as premium_first_share_pct,
  -- P2: two_card 첫선택 층 (웰컴 15 판정의 본체)
  round(100.0 * count(*) filter (where grp = 'two') / count(*), 1) as two_first_share_pct,
  round(100.0 * count(rev) filter (where grp = 'two') / nullif(count(*) filter (where grp = 'two'), 0), 1) as two_first_payer_pct,
  round(coalesce(sum(rev) filter (where grp = 'two'), 0) / nullif(count(*) filter (where grp = 'two'), 0)) as two_first_rev_ps,
  -- Primary
  round(100.0 * count(rev) / count(*), 1) as payer_pct,
  round(coalesce(sum(rev), 0) / nullif(count(rev), 0)) as arppu,
  round(coalesce(sum(rev), 0) / count(*)) as rev_ps,
  -- LEAST 는 NULL 을 무시하므로 비결제자를 먼저 0 으로 만들어야 한다 (안 하면 비결제자가 20000 으로 잡힘)
  round(sum(least(coalesce(rev, 0), 20000)) / count(*)) as rev_ps_whalecap20k,
  count(*) filter (where pn > 1) as repeat_payers,
  -- 대화 품질 (유료 첫 리딩)
  round(100.0 * count(*) filter (where stars_spent > 0 and not coalesce(ended, false)) / nullif(count(*) filter (where stars_spent > 0), 0), 1) as silent_exit_pct,
  round(100.0 * count(result_viewed_at) filter (where stars_spent > 0) / nullif(count(*) filter (where stars_spent > 0), 0), 1) as viewed_pct,
  round(avg(ut) filter (where stars_spent > 0), 2) as avg_user_turns,
  -- 페이월 경로
  round(100.0 * count(sh_t) / count(*), 1) as shop_visit_pct,
  round(100.0 * count(rev) filter (where sh_t is not null) / nullif(count(sh_t), 0), 1) as shop_to_pay_pct,
  (select n from ic) as inchat_sheet_opens,
  -- 리텐션 (D7 은 7일 성숙한 가입만 분모)
  round(100.0 * count(*) filter (where days >= 2) / count(*), 1) as visit2_pct,
  count(*) filter (where ts < (now() at time zone 'UTC' + interval '9 hours') - interval '7 days') as d7_eligible,
  round(100.0 * count(*) filter (where last_ts >= ts + interval '7 days')
        / nullif(count(*) filter (where ts < (now() at time zone 'UTC' + interval '9 hours') - interval '7 days'), 0), 1) as d7_return_pct
from g;
