-- 광고 소재 round3(love_r3) 판정 — 결정 2026-10-09(메모리 ads-review-2026-10-04 '소재 판정')
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/creative-r3-verdict.sql
-- 모집단: first-touch utm_campaign '120249541940740128' & utm_content ∈ {love, love_r3} · 지인 6명 제외
--   전 = 2026-10-04 ~ 10-09 12:36 KST 가입(전원 옛 제품) — 기준선
--   후 = 10-09 12:36 ~ 10-23 12:36 KST 가입 중 옛 그룹(user_id 끝 글자 홀수)만 — 메뉴판 반반의 영향을 안 받는 쪽
-- P1 = 가입 48시간 안 첫 결제가 그 유저의 첫 리딩(종류 무관)보다 먼저(리딩 없이 결제만 한 경우 포함) — atc-vs-purchase-verdict.sql 과 같은 정의
-- 기준: 후 P1 ≥ 3% → 회복 / 미만 → 미회복(정상 시기 ~5.6%). 실행 = 10-25 12:36 KST(48시간 성숙) 뒤 — 그 전엔 성숙 가입만 센다
-- 광고비는 그룹을 못 가른다(한 세트가 두 그룹을 다 데려옴) → 가입 단가는 후 기간 두 그룹 합계로

with
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),
acq as (
  select a.user_id, a.utm_content, us.created_at as signup_at,
         case when position(right(a.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as product_arm
  from user_acquisition a
  join users us on us.id = a.user_id
  where a.utm_source = 'meta' and a.utm_campaign = '120249541940740128'
    and a.utm_content in ('love', 'love_r3')
    and left(a.user_id::text, 8) not in (select p from ex)
),
u as (
  select acq.*,
         case when signup_at >= timestamptz '2026-10-04 00:00:00+09' and signup_at < timestamptz '2026-10-09 12:36:00+09' then 'before'
              when signup_at >= timestamptz '2026-10-09 12:36:00+09' and signup_at < timestamptz '2026-10-23 12:36:00+09' then 'after'
         end as period
  from acq
),
first_reading as (
  select r.user_id, min(r.created_at) as first_reading_at
  from readings r where r.user_id in (select user_id from u where period is not null)
  group by 1
),
uf as (
  select u.*,
         u.signup_at <= now() - interval '48 hours' as mature,
         fr.first_reading_at,
         (select min(p.created_at) from payments p
           where p.user_id = u.user_id and p.status = 'completed'
             and p.created_at < u.signup_at + interval '48 hours') as first_pay_at,
         (select coalesce(sum(p.amount_won), 0) from payments p
           where p.user_id = u.user_id and p.status = 'completed'
             and p.created_at < u.signup_at + interval '48 hours') as rev48
  from u left join first_reading fr on fr.user_id = u.user_id
  where u.period is not null
),
uf2 as (
  select uf.*,
         uf.first_pay_at is not null and (uf.first_reading_at is null or uf.first_pay_at < uf.first_reading_at) as p1,
         -- 판정 대상: 전 = 전원 · 후 = 옛 그룹만
         (uf.period = 'before' or uf.product_arm = 'legacy') as judged
  from uf
),
summary as (
  select period,
         count(*) filter (where judged) as signups,
         count(*) filter (where judged and mature) as mature,
         count(*) filter (where judged and mature and p1) as p1_payers,
         round(100.0 * count(*) filter (where judged and mature and p1) / nullif(count(*) filter (where judged and mature), 0), 2) as p1_pct,
         count(*) filter (where judged and mature and first_pay_at is not null) as payers48,
         round(100.0 * count(*) filter (where judged and mature and first_pay_at is not null) / nullif(count(*) filter (where judged and mature), 0), 2) as pay48_pct,
         coalesce(sum(rev48) filter (where judged and mature), 0) as rev48,
         round(coalesce(sum(rev48) filter (where judged and mature), 0)::numeric / nullif(count(*) filter (where judged and mature), 0)) as rev48_per_signup,
         count(*) as signups_all_arms
  from uf2 group by period
),
by_creative as (   -- 후 기간 옛 그룹의 광고별(서술용 — Meta 배분 탓에 공정 비교 아님)
  select utm_content, count(*) as signups,
         count(*) filter (where mature and p1) as p1_payers,
         count(*) filter (where mature) as mature
  from uf2 where period = 'after' and judged group by 1
),
weekly as (
  select case when signup_at < timestamptz '2026-10-16 12:36:00+09' then 1 else 2 end as week_no,
         count(*) as signups, count(*) filter (where mature and p1) as p1_payers, count(*) filter (where mature) as mature
  from uf2 where period = 'after' and judged group by 1
),
spend as (
  select case when s.spend_date < date '2026-10-09' then 'before'
              when s.spend_date between date '2026-10-09' and date '2026-10-23' then 'after' end as period,
         sum(s.spend_won) as spend_won, sum(s.impressions) as impressions
  from ad_spend s
  where s.platform = 'meta' and s.creative_key in ('love', 'love_r3') and s.spend_date >= date '2026-10-04' and s.spend_date <= date '2026-10-23'
  group by 1
)
select 'summary' as k, to_jsonb(array_agg(s order by s.period)) as v from summary s
union all select 'after_by_creative', to_jsonb(array_agg(c order by c.utm_content)) from by_creative c
union all select 'after_weekly', to_jsonb(array_agg(w order by w.week_no)) from weekly w
union all select 'spend', to_jsonb(array_agg(sp order by sp.period)) from spend sp;
