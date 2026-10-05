-- 2주 판정 — 기존 결제(구매) 최적화 세트 A vs 잔액 부족 모달(AddToCart) 최적화 캠페인 B
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/atc-vs-purchase-verdict.sql
--
-- 결정(2026-10-04 사용자): A·B 를 2주 병행(합계 ₩30k/일 한정) → "가입당" 결제가 높은 쪽만 남기고 ₩20k/일 복귀.
--   가입 수로 판정하지 않는다 — 모달 최적화는 가입↑·결제율↓ 일 수 있다.
--   주 지표 = P1 율 · 보조 = 48시간 결제율 · 48시간 매출/가입 · ROAS48 · 광고비/P1
--   A 단독 회복 기준(같은 날 결정): 성숙 가입 300명 중 P1 ≥ 9 회복 / ≤ 8 미회복 (09-10~19 정상 ~6%, 기대 19)
--   배경: 09-20 부터 P1(첫 리딩 전 선결제)만 무너졌고 첫 리딩 후 결제(P2)는 그대로였다
--
-- ▶ 실행 시점: window.run_on_or_after_kst(창 종료 + 48시간) 이후 — 그래야 immature 0 으로 ROAS48 까지 정합.
--   그 전에 돌려도 되지만 결제 지표는 성숙 가입만 센다(검열).
--
-- 갈래 (first-touch utm = user_acquisition. 광고 URL 파라미터 utm_campaign={{campaign.id}} · utm_content={{ad.name}}):
--   A = utm_campaign '120249541940740128'(byeolkong_2026-07_launch) 이고 utm_content 'love'   ← 기존 결제 세트
--   B = utm_content 가 'atc_' 로 시작                                                       ← 새 캠페인(광고 이름 규칙)
--   🔴 B 광고 이름은 저장 전에 'atc_…' 로 — {{ad.name}} 은 저장 시점 이름으로 URL 에 박제된다('- 사본' 사고 전례).
--      광고비도 같은 이름(ad_spend.creative_key)으로 가른다
--   🔴 '_' 는 LIKE 와일드카드라 left(…, 4) = 'atc_' 로 비교한다
--   창 = B 첫 가입의 KST 날짜부터 14일. 두 갈래가 같은 달력을 쓴다(한글날 연휴도 양쪽 공통)
--   창 안의 나머지 메타 가입은 unclassified 로 보여 이름 실수(사본·미해석 매크로·love_v3 잔존)를 드러낸다
--
-- 정의:
--   성숙 = 가입 후 48시간 경과(실행 시각 기준)
--   P1 = 가입 48시간 안의 첫 결제가 그 유저의 첫 리딩(종류 무관)보다 먼저. 리딩 없이 결제만 한 경우 포함
--   결제 = payments.status 'completed'. 탈퇴로 user_id 가 NULL 이 된 결제는 유저에 못 붙어 빠진다(하한)
--   top1_share_pct = 48시간 매출 중 최대 결제자 1명 몫 — 2026-08 판정이 고래 1명에 뒤집힌 전례가 있다
--   z = 두 비율 합동 z. |z| < 1.96 이면 차이가 표본 잡음 범위다
--   AddToCart = paywall_shown 또는 그 자리 충전 시트(recharge_sheet_opened, source ≠ shop)의 (유저, KST 날짜).
--     Meta 로 나간 eventId(atc:{userId}:{KST 날짜})와 같은 단위. 갈래는 first-touch 근사 — Meta 귀속(클릭 7일)과 다르다
--   지인 6명 제외(8자 prefix)

with
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

acq as (
  select a.user_id, a.utm_campaign, a.utm_content, us.created_at as signup_at,
         ((us.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when a.utm_campaign = '120249541940740128' and a.utm_content = 'love' then 'A'
              when left(a.utm_content, 4) = 'atc_' then 'B' end as arm
  from user_acquisition a
  join users us on us.id = a.user_id
  where a.utm_source = 'meta'
    and left(a.user_id::text, 8) not in (select p from ex)
),
w as (
  select min(kst_date) as start_date, min(kst_date) + 14 as end_date   -- end_date 는 미포함
  from acq where arm = 'B'
),
u as (
  select acq.* from acq, w
  where acq.kst_date >= w.start_date and acq.kst_date < w.end_date
),
first_reading as (
  select r.user_id, min(r.created_at) as first_reading_at
  from readings r
  where r.user_id in (select user_id from u)
  group by 1
),
pay48 as (
  select p.user_id, p.amount_won, p.created_at
  from payments p
  join u on u.user_id = p.user_id
  where p.status = 'completed'
    and p.created_at < u.signup_at + interval '48 hours'
),
uf as (
  select u.*,
         u.signup_at <= now() - interval '48 hours' as mature,
         fr.first_reading_at,
         (select min(p.created_at) from pay48 p where p.user_id = u.user_id) as first_pay_at,
         (select coalesce(sum(p.amount_won), 0) from pay48 p where p.user_id = u.user_id) as rev48
  from u left join first_reading fr on fr.user_id = u.user_id
),
uf2 as (
  select uf.*,
         uf.first_pay_at is not null
           and (uf.first_reading_at is null or uf.first_pay_at < uf.first_reading_at) as p1
  from uf
),
spend_daily as (
  select s.spend_date,
         case when s.creative_key = 'love' then 'A'
              when left(s.creative_key, 4) = 'atc_' then 'B' end as arm,
         sum(s.spend_won) as spend_won
  from ad_spend s, w
  where s.platform = 'meta'
    and s.spend_date >= w.start_date and s.spend_date < w.end_date
  group by 1, 2
),
spend as (
  select arm, sum(spend_won) as spend_won from spend_daily where arm is not null group by 1
),

win as (
  select w.start_date, w.end_date - 1 as last_date, w.end_date + 2 as run_on_or_after_kst,
         ((now() at time zone 'UTC' + interval '9 hours'))::timestamp(0) as run_at_kst,
         case when w.start_date is null
              then 'B 가입 0건 — 새 캠페인 광고 이름이 atc_ 로 시작하는지, URL 파라미터에 utm_content={{ad.name}} 이 있는지 확인'
         end as warning
  from w
),
arms as (
  select f.arm,
         count(*) as signups,
         count(*) filter (where f.mature) as mature,
         count(*) filter (where not f.mature) as immature,
         count(*) filter (where f.mature and f.p1) as p1_payers,
         round(100.0 * count(*) filter (where f.mature and f.p1)
               / nullif(count(*) filter (where f.mature), 0), 2) as p1_pct,
         count(*) filter (where f.mature and f.first_pay_at is not null) as payers48,
         round(100.0 * count(*) filter (where f.mature and f.first_pay_at is not null)
               / nullif(count(*) filter (where f.mature), 0), 2) as pay48_pct,
         coalesce(sum(f.rev48) filter (where f.mature), 0) as rev48,
         round(coalesce(sum(f.rev48) filter (where f.mature), 0)::numeric
               / nullif(count(*) filter (where f.mature), 0)) as rev48_per_signup,
         round(100.0 * max(f.rev48) filter (where f.mature)
               / nullif(sum(f.rev48) filter (where f.mature), 0), 1) as top1_share_pct,
         sp.spend_won,
         round(sp.spend_won::numeric / nullif(count(*), 0)) as cac,
         round(sp.spend_won::numeric / nullif(count(*) filter (where f.mature and f.p1), 0)) as cost_per_p1,
         round(coalesce(sum(f.rev48) filter (where f.mature), 0)::numeric / nullif(sp.spend_won, 0), 2) as roas48
  from uf2 f
  left join spend sp on sp.arm = f.arm
  where f.arm is not null
  group by f.arm, sp.spend_won
),
diff as (
  select d.*,
         case when abs(d.p1_z) >= 1.96 then '유의(5%)' else '미유의 — 표본 잡음 범위' end as p1_verdict,
         case when abs(d.pay48_z) >= 1.96 then '유의(5%)' else '미유의 — 표본 잡음 범위' end as pay48_verdict
  from (
    select b.p1_pct - a.p1_pct as p1_diff_pp,
           round((b.p1_payers::numeric / b.mature - a.p1_payers::numeric / a.mature)
                 / nullif(sqrt(((a.p1_payers + b.p1_payers)::numeric / (a.mature + b.mature))
                               * (1 - (a.p1_payers + b.p1_payers)::numeric / (a.mature + b.mature))
                               * (1.0 / a.mature + 1.0 / b.mature)), 0), 2) as p1_z,
           b.pay48_pct - a.pay48_pct as pay48_diff_pp,
           round((b.payers48::numeric / b.mature - a.payers48::numeric / a.mature)
                 / nullif(sqrt(((a.payers48 + b.payers48)::numeric / (a.mature + b.mature))
                               * (1 - (a.payers48 + b.payers48)::numeric / (a.mature + b.mature))
                               * (1.0 / a.mature + 1.0 / b.mature)), 0), 2) as pay48_z,
           b.rev48_per_signup - a.rev48_per_signup as rev48_per_signup_diff
    from arms a, arms b
    where a.arm = 'A' and b.arm = 'B' and a.mature > 0 and b.mature > 0
  ) d
),
a_recovery as (
  select mature, p1_payers,
         round(300.0 * p1_payers / nullif(mature, 0), 1) as p1_per_300,
         case when mature < 300 then '표본 부족(성숙 < 300) — 판정 보류'
              when 300.0 * p1_payers / mature >= 9 then '회복'
              else '미회복' end as verdict
  from arms where arm = 'A'
),
daily as (
  select g.d::date as kst_date, ar.arm,
         (select count(*) from uf2 f where f.kst_date = g.d::date and f.arm = ar.arm) as signups,
         (select count(*) from uf2 f where f.kst_date = g.d::date and f.arm = ar.arm and f.mature and f.p1) as p1_payers,
         (select count(*) from uf2 f where f.kst_date = g.d::date and f.arm = ar.arm and f.mature
                                           and f.first_pay_at is not null) as payers48,
         (select sd.spend_won from spend_daily sd where sd.spend_date = g.d::date and sd.arm = ar.arm) as spend_won
  from w,
       generate_series(w.start_date::timestamp,
                       least(w.end_date - 1, (now() at time zone 'UTC' + interval '9 hours')::date)::timestamp,
                       interval '1 day') g(d),
       (values ('A'), ('B')) ar(arm)
),
unclassified as (
  select coalesce(utm_campaign, '(null)') as utm_campaign,
         coalesce(utm_content, '(null)') as utm_content,
         count(*) as signups
  from u where arm is null
  group by 1, 2
),
atc as (
  select distinct e.user_id,
         ((e.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date
  from ui_events e
  where e.user_id is not null
    and left(e.user_id::text, 8) not in (select p from ex)
    and (e.event = 'paywall_shown'
         or (e.event = 'recharge_sheet_opened'
             and e.meta->>'source' in ('inchat', 'tarot_draw', 'fortune_purchase', 'compat', 'tarot_report')))
),
atc_weekly as (
  select coalesce(f.arm, 'other') as arm,
         (atc.kst_date - w.start_date) / 7 + 1 as week_no,
         count(*) as atc_user_days
  from atc
  cross join w
  left join uf2 f on f.user_id = atc.user_id
  where atc.kst_date >= w.start_date and atc.kst_date < w.end_date
  group by 1, 2
)

select 'window' as metric, to_jsonb(array_agg(x)) as value from win x
union all select 'arms',                        to_jsonb(array_agg(a order by a.arm)) from arms a
union all select 'diff_B_minus_A',              to_jsonb(array_agg(d)) from diff d
union all select 'a_recovery_300',              to_jsonb(array_agg(r)) from a_recovery r
union all select 'daily',                       to_jsonb(array_agg(d order by d.kst_date, d.arm)) from daily d
union all select 'unclassified_meta_in_window', to_jsonb(array_agg(c order by c.signups desc)) from unclassified c
union all select 'atc_user_days_weekly',        to_jsonb(array_agg(t order by t.arm, t.week_no)) from atc_weekly t;
