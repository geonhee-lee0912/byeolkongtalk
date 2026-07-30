-- 판정 사이클 스냅샷 D — 재화 · 결제 · 광고비 · 소재별 유닛 · 교차이용 · error_logs
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/cycle-snapshot-d-economics.sql
--
-- day 0 = 2026-07-26. d4=7/30 · d7=8/2 · d14=8/9 · d21=8/16 · d28=8/23
-- 판정 목표 = 기여마진 ₩66 vs CAC ₩505 (회수 13%) 의 궤적. [[pnl-findings-2026-07-25]]
--
-- ⚠️ 탈퇴가 과거를 지운다 — users DELETE → payments·star_transactions·readings·user_acquisition CASCADE.
--    누적 매출·CAC 는 **구조적으로 과소 집계**다. 유입 스냅샷만 account_withdrawals 에 보존된다.
--    → 소재별 가입수는 users+withdrawals 를 합산해야 실제 분모가 된다.
-- ⚠️ star_transactions.amount 는 spend 도 **양수**다. type 은 실무상 'charge'/'spend' 2값뿐이며
--    환불도 type='charge' + source like '%refund%' 로 들어온다(신규 재화가 아니다 — 이중계상 주의).
-- ⚠️ 매출은 반드시 payments.status='completed'. stars_given 은 패키지 정액이라 첫충전 보너스를 뺀 값이다.
-- ⚠️ 버킷 = KST 자정.

with
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

meta as (
  select now() as run_at,
         ((now() at time zone 'UTC' + interval '9 hours')::date) as today_kst,
         (((now() at time zone 'UTC')::date) - date '2026-07-26') as cycle_day
),

-- ══ 1. 가입 / 탈퇴 일별 ══
-- ⚠️ 좌우 비대칭: withdrawals 는 어드민 제외가 **불가능**하다(account_withdrawals 에 user_id 가
--    없다 — 개인정보 최소화 설계). signups 만 제외돼 있으니 두 열의 차를 순증으로 읽지 말 것.
signup as (
  select ((created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date, count(*) as signups
  from users where left(id::text,8) not in (select p from ex) group by 1
),
withdraw as (
  select ((withdrawn_at at time zone 'UTC' + interval '9 hours')::date) as kst_date, count(*) as withdrawals
  from account_withdrawals group by 1
),
churn as (
  select coalesce(s.kst_date, w.kst_date) as kst_date,
         coalesce(s.signups,0) as signups, coalesce(w.withdrawals,0) as withdrawals
  from signup s full outer join withdraw w on w.kst_date = s.kst_date
  where coalesce(s.kst_date, w.kst_date) >= (current_date - 21)
),

-- ══ 2. 별 지급 — 무료 vs 유료 (source별) ══
grants as (
  select st.source,
         case when st.source = 'pg' then 'paid'
              when st.source like '%refund%' then 'refund'
              else 'free' end as kind,
         count(*) as tx,
         sum(st.amount) as stars,
         count(distinct st.user_id) as users
  from star_transactions st
  where st.type = 'charge' and left(st.user_id::text,8) not in (select p from ex)
  group by 1,2 order by 4 desc
),
grants_daily as (
  select ((st.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         sum(st.amount) filter (where st.source = 'pg') as paid_stars,
         sum(st.amount) filter (where st.source in ('welcome_bonus','first_charge_bonus')) as free_stars,
         sum(st.amount) filter (where st.source = 'admin_adjust') as admin_stars,
         sum(st.amount) filter (where st.source like '%refund%') as refund_stars
  from star_transactions st
  where st.type='charge' and left(st.user_id::text,8) not in (select p from ex)
    and st.created_at >= now() - interval '21 days'
  group by 1 order by 1
),

-- ══ 3. 별 소모 — 상품별 ══
spend as (
  select st.source, count(*) as tx, sum(st.amount) as stars, count(distinct st.user_id) as users
  from star_transactions st
  where st.type='spend' and left(st.user_id::text,8) not in (select p from ex)
  group by 1 order by 3 desc
),
spend_daily as (
  select ((st.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         sum(st.amount) as stars, count(*) as tx, count(distinct st.user_id) as users,
         sum(st.amount) filter (where st.source like 'fortune_%' and st.source not like '%refund%') as fortune,
         sum(st.amount) filter (where st.source in ('tarot_reading','saju_reading','reading')) as reading,
         sum(st.amount) filter (where st.source like 'rel_%' or st.source = 'relationship_pass') as relationship,
         sum(st.amount) filter (where st.source in ('clarifier','extend')) as inchat
  from star_transactions st
  where st.type='spend' and left(st.user_id::text,8) not in (select p from ex)
    and st.created_at >= now() - interval '21 days'
  group by 1 order by 1
),

-- ══ 4. 결제 (매출) ══
-- ⚠️ 별칭 주의: ex 의 컬럼명이 p 라서 payments 를 p 로 잡으면 안 된다 → pm 사용
pay as (
  select pm.* from payments pm
  where pm.status='completed' and left(pm.user_id::text,8) not in (select p from ex)
),
pay_daily as (
  select ((created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         count(*) as payments, count(distinct user_id) as payers,
         sum(amount_won) as revenue_won, sum(stars_given) as stars_given
  from pay where created_at >= now() - interval '21 days'
  group by 1 order by 1
),
pay_pkg as (
  select package_type, count(*) as n, count(distinct user_id) as payers,
         sum(amount_won) as revenue_won
  from pay group by 1 order by 4 desc
),
-- 재구매 분포
pay_repeat as (
  select cnt as payments_per_user, count(*) as users, sum(rev) as revenue_won
  from (select user_id, count(*) as cnt, sum(amount_won) as rev from pay group by 1) z
  group by 1 order by 1
),

-- ══ 5. 광고비 ══
ad as (
  select spend_date, creative_key, sum(spend_won) as spend_won,
         sum(impressions) as impressions, sum(clicks) as clicks, sum(reach) as reach
  from ad_spend where spend_date >= (current_date - 21)
  group by 1,2 order by 1 desc, 3 desc
),
ad_total as (
  select creative_key, sum(spend_won) as spend_won, min(spend_date) as first_day, max(spend_date) as last_day,
         sum(spend_won) filter (where spend_date >= date '2026-07-26') as spend_since_d0
  from ad_spend group by 1 order by 2 desc
),

-- ══ 6. 소재별 유닛 (CAC · 매출 · 기여) ══
-- 분모 보정: 탈퇴자도 user_acquisition 이 사라지므로 account_withdrawals 스냅샷을 합산한다
-- 🔴 모집단은 반드시 `users` 다. `user_acquisition` 을 FROM 으로 쓰면 안 된다 —
--    lib/acquisition.ts:42 가 utm_*/fbclid 가 하나도 없으면 null 을 반환하므로
--    **오가닉 유저는 user_acquisition 에 행이 아예 없다.** FROM 으로 쓰면 분모에서 통째로 사라지고
--    '(직접/오가닉)' 라벨은 "utm_source 는 있고 utm_content 만 없는" 광고 유저를 뜻하게 된다.
-- ⚠️ first_seen_at 은 nullable → users.created_at 으로 폴백해야 joined_kst 가 NULL 로 새지 않는다.
acq_live as (
  select coalesce(nullif(ua.utm_content,''), '(직접/오가닉)') as src,
         u.id as user_id,
         ((coalesce(ua.first_seen_at, u.created_at) at time zone 'UTC' + interval '9 hours')::date) as joined_kst
  from users u
  left join user_acquisition ua on ua.user_id = u.id
  where left(u.id::text,8) not in (select p from ex)
),
-- ⚠️ 2026-07-26 이전 탈퇴자는 utm 스냅샷 컬럼이 없던 시절이라 전부 '(직접/오가닉)' 으로 접힌다.
--    n_before_snapshot 으로 그 혼입 규모를 드러낸다.
acq_gone as (
  select coalesce(nullif(aw.utm_content,''), '(직접/오가닉)') as src, count(*) as n,
         count(*) filter (where aw.withdrawn_at < '2026-07-26T01:00:00Z') as n_before_snapshot
  from account_withdrawals aw group by 1
),
user_rev as (
  select user_id, sum(amount_won) as rev from pay group by 1
),
-- ⚠️ full outer join — 유입 유저가 전원 탈퇴한 소재가 표에서 사라지지 않게 한다
--    (LEFT JOIN 이면 "성과 0" 이 아니라 "존재하지 않음"으로 보인다)
unit as (
  select coalesce(a.src, g.src) as src,
         count(a.user_id) as users_live,
         coalesce(g.n, 0) as users_withdrawn,
         coalesce(g.n_before_snapshot, 0) as withdrawn_pre_snapshot,
         count(a.user_id) + coalesce(g.n,0) as users_total,
         count(*) filter (where ur.rev is not null) as payers,
         coalesce(sum(ur.rev), 0) as revenue_won,
         round(coalesce(sum(ur.rev),0)::numeric / nullif(count(a.user_id),0), 0) as arpu_live_won,
         count(*) filter (where a.joined_kst >= date '2026-07-26') as users_since_d0,
         count(*) filter (where a.joined_kst >= date '2026-07-26' and ur.rev is not null) as payers_since_d0
  from acq_live a
  full outer join acq_gone g on g.src = a.src
  left join user_rev ur on ur.user_id = a.user_id
  group by coalesce(a.src, g.src), g.n, g.n_before_snapshot order by 5 desc
),

-- ══ 7. 교차 이용 ARPU (pnl findings 의 유일한 실측 ARPU 레버) ══
-- chat 단독 ₩147 / chat+운세 ₩722 / chat+관계 ₩882 (2026-07-25 baseline)
cross_use as (
  select case when has_chat and has_fortune and has_rel then '4_chat+fortune+rel'
              when has_chat and has_rel                then '3_chat+rel'
              when has_chat and has_fortune             then '2_chat+fortune'
              when has_chat                             then '1_chat_only'
              else '0_other' end as segment,
         count(*) as users,
         sum(revenue_won) as revenue_won,
         round(avg(revenue_won)::numeric, 0) as arpu_won,
         count(*) filter (where revenue_won > 0) as payers
  from (
    select u.id,
           -- ⚠️ skill_key/relationship_id 를 반드시 배제한다. 관계 스킬 리딩이 consultation_type='tarot'
           --    으로 저장되므로 안 걸면 관계 전용 유저가 chat+rel 로 흘러가 세그먼트가 오염된다
           --    (B·C 파일의 "chat" 정의와 맞추는 것이기도 하다)
           exists (select 1 from readings r where r.user_id=u.id
                     and r.consultation_type in ('saju','tarot')
                     and r.skill_key is null and r.relationship_id is null
                     and coalesce(r.emotion_tag,'') not like 'fortune:%') as has_chat,
           exists (select 1 from readings r where r.user_id=u.id
                     and coalesce(r.emotion_tag,'') like 'fortune:%') as has_fortune,
           exists (select 1 from relationships rl where rl.user_id=u.id) as has_rel,
           coalesce((select sum(p.amount_won) from payments p
                     where p.user_id=u.id and p.status='completed'), 0) as revenue_won
    from users u where left(u.id::text,8) not in (select p from ex)
  ) z group by 1 order by 1
),

-- ══ 8. error_logs ══
errs as (
  select ((created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date, level, count(*) as n
  from error_logs where created_at >= now() - interval '10 days'
  group by 1,2 order by 1 desc, 2
),
errs_top as (
  select level, route, left(message, 110) as msg, count(*) as n, max(created_at) as last_seen
  from error_logs where created_at >= '2026-07-26T01:00:00Z'
  group by 1,2,3 order by 4 desc limit 25
)

select 'meta' as metric, to_jsonb(array_agg(x)) as value from meta x
union all select 'signup_churn',  to_jsonb(array_agg(c)) from (select * from churn order by kst_date) c
union all select 'star_grants',   to_jsonb(array_agg(g)) from grants g
union all select 'star_grants_daily', to_jsonb(array_agg(g)) from grants_daily g
union all select 'star_spend',    to_jsonb(array_agg(s)) from spend s
union all select 'star_spend_daily', to_jsonb(array_agg(s)) from spend_daily s
union all select 'pay_daily',     to_jsonb(array_agg(p)) from pay_daily p
union all select 'pay_package',   to_jsonb(array_agg(p)) from pay_pkg p
union all select 'pay_repeat',    to_jsonb(array_agg(p)) from pay_repeat p
union all select 'ad_spend_daily', to_jsonb(array_agg(a)) from ad a
union all select 'ad_spend_total', to_jsonb(array_agg(a)) from ad_total a
union all select 'unit_by_source', to_jsonb(array_agg(u)) from unit u
union all select 'cross_use_arpu', to_jsonb(array_agg(c)) from cross_use c
union all select 'error_daily',   to_jsonb(array_agg(e)) from errs e
union all select 'error_top',     to_jsonb(array_agg(e)) from errs_top e;
