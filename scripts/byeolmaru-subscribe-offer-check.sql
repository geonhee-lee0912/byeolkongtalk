-- 별마루 체험 중·체험 전 구독 노출 — 판독 + 즉시 조치 고장 감시. 🔴 읽기 전용
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/byeolmaru-subscribe-offer-check.sql
-- 스펙: docs/superpowers/specs/2026-10-11-별마루-체험중-구독노출-design.md §5·§6
--
-- ▶ prod 배포 뒤 첫 실행 전에 params 의 deploy_at 을 실제 배포 시각(KST)으로 바꾼다. 비어 있으면 경고만 나온다.
-- 성공 기준(배포 후 4주 · 실인원 · 지인 6명 제외 — 사용자 결정 2026-10-11):
--   체험 중(phase=trial) 노출 ~40명 중 클릭 0       → 상품·가격
--   클릭은 있는데 충전(시트·결제)에서 멈춤         → 현금 장벽
--   구매(구독 행) 4명+                             → 유지
--   기대치 = 4주 구매 1건 안팎(0건 확률 ~30%) — 0건으로 실패를 단정하지 말고 '막힌 단계'로 읽는다
-- 즉시 조치 고장(행이 한 줄이라도 있으면 멈추고 본다):
--   broken_500        — 구독 라우트 error 로그(구매 실패 — 402 는 정상 신호라 안 남는다) · 클라 failed{status=500}
--   broken_no_row     — 완료 이벤트인데 그 앞뒤로 구독 행이 없다
--   broken_double_row — 같은 유저 1분 안 구독 행 2개(연타·두 탭 이중 차감 — 스펙 §4-1. 나오면 서버 방어를 넣는다)
-- ⚠️ byeolmaru_trial_started 는 이 배포부터 진행 중 잠금으로 연타가 한 번만 찍힌다 — events 수가 줄고 실인원은 그대로다.
--    배포 전후 events 수 비교 금지(이 쿼리는 실인원만 센다 · 어드민 별마루 퍼널의 events 열도 같은 이유로 꺾인다).
-- ⚠️ phase 별 퍼널은 더해지지 않는다 — 한 사람이 체험 전 링크·체험 중 넛지·체험 후 배너를 다 볼 수 있다. 중복 없는 합은 funnel_overall.
-- 정의:
--   offered   = byeolmaru_subscribe_offer_shown 실인원(user_id — 별마루 구독 선택지는 로그인 화면에만 있다)
--   clicked   = byeolmaru_subscribe_clicked 실인원(충전하고 돌아와 자동으로 다시 열린 확인창은 클릭이 아니라 안 찍힌다)
--   funnel_by_phase 의 뒤 단계는 '그 phase 의 첫 클릭 뒤':
--     short_modal = 잔액 부족 모달(paywall_shown, surface='byeolmaru_subscribe') · sheet = 그 자리 충전 시트(recharge_sheet_opened,
--     source='byeolmaru_subscribe') · pay_start = 토스 결제 시작(recharge_payment_started, 같은 source) ·
--     paid = 그 결제 시작 뒤 결제 완료(payments.status='completed') · purchased = 구독 행(byeolmaru_subscriptions — 정본)
--   phase '(없음)' = surface·phase 를 안 싣는 낡은 번들의 클릭(배포 직후 잠깐)
--   sub_rows = 배포 뒤 구독 행 전부(지인 포함·acquaintance 표시) — 구매 일수(p_days)가 단계대로 났는지 본다:
--     체험 전 구매 33 · 체험 중 30 + 남은 체험 올림 · 체험 후 30 · 연장(extension)은 이어 붙여 더 길다(기대값 없음).
--     len_days 가 expected_days 와 1일 어긋나면 먼저 남은 체험이 하루 경계에서 몇 초 차이였는지 본다(서버·DB 시계 차).
--     phase_at_purchase 'no_trial_record' = 체험 기록이 없다 — 체험 전 구매 뒤 기록 실패(error_logs stage=record_trial) 의심
--   user_id 는 8자 prefix 로만 내보낸다(풀 UUID = 로그인 자격 — 출력·커밋 금지). 지인 6명 제외(sub_rows 만 표시로 남긴다)
--   날짜는 전부 KST — (created_at at time zone 'UTC' + interval '9 hours')

with
params as (select null::timestamptz as deploy_at),   -- ▶ 예: timestamptz '2026-10-26 21:00:00+09'
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

win as (
  select deploy_at,
         ((now() at time zone 'UTC' + interval '9 hours'))::timestamp(0) as run_at_kst,
         ((deploy_at + interval '28 days') at time zone 'UTC' + interval '9 hours')::timestamp(0) as verdict_on_or_after_kst,
         case when deploy_at is null then '⚠️ deploy_at 이 비었다 — params 에 체험 중 구독 노출 prod 배포 시각(KST)을 넣고 다시 실행' end as warning
  from params
),

ev as (
  select e.user_id, e.event, e.meta, e.created_at
  from ui_events e, params
  where params.deploy_at is not null and e.created_at >= params.deploy_at
    and e.user_id is not null
    and left(e.user_id::text, 8) not in (select p from ex)
    and (e.event in ('byeolmaru_subscribe_offer_shown', 'byeolmaru_subscribe_clicked', 'byeolmaru_subscribe_completed',
                     'byeolmaru_subscribe_failed', 'byeolmaru_trial_started')
         or (e.event = 'paywall_shown' and e.meta->>'surface' = 'byeolmaru_subscribe')
         or (e.event in ('recharge_sheet_opened', 'recharge_payment_started') and e.meta->>'source' = 'byeolmaru_subscribe'))
),
pay as (
  select pm.user_id, pm.created_at
  from payments pm, params
  where params.deploy_at is not null and pm.created_at >= params.deploy_at
    and pm.status = 'completed' and pm.user_id is not null
    and left(pm.user_id::text, 8) not in (select p from ex)
),
subs_all as (
  select s.id, s.user_id, s.started_at, s.expires_at, s.stars_spent, s.created_at,
         left(s.user_id::text, 8) in (select p from ex) as acquaintance
  from byeolmaru_subscriptions s, params
  where params.deploy_at is not null and s.created_at >= params.deploy_at
),
subs as (select * from subs_all where not acquaintance),

-- 자리 × 단계 — 노출 실인원과 같은 자리·단계의 클릭 실인원
reach as (
  select coalesce(meta->>'phase', '(없음)') as phase, coalesce(meta->>'surface', '(없음)') as surface,
         count(distinct user_id) filter (where event = 'byeolmaru_subscribe_offer_shown') as offered,
         count(distinct user_id) filter (where event = 'byeolmaru_subscribe_clicked') as clicked
  from ev
  where event in ('byeolmaru_subscribe_offer_shown', 'byeolmaru_subscribe_clicked')
  group by 1, 2
),

first_click as (
  select coalesce(meta->>'phase', '(없음)') as phase, user_id, min(created_at) as t0
  from ev where event = 'byeolmaru_subscribe_clicked'
  group by 1, 2
),
click_steps as (
  select f.phase, f.user_id,
         exists (select 1 from ev e where e.user_id = f.user_id and e.event = 'paywall_shown' and e.created_at >= f.t0) as short_modal,
         exists (select 1 from ev e where e.user_id = f.user_id and e.event = 'recharge_sheet_opened' and e.created_at >= f.t0) as sheet,
         exists (select 1 from ev e where e.user_id = f.user_id and e.event = 'recharge_payment_started' and e.created_at >= f.t0) as pay_start,
         exists (select 1 from ev e join pay pm on pm.user_id = e.user_id and pm.created_at >= e.created_at
                 where e.user_id = f.user_id and e.event = 'recharge_payment_started' and e.created_at >= f.t0) as paid,
         exists (select 1 from subs s where s.user_id = f.user_id and s.created_at >= f.t0) as purchased
  from first_click f
),
offered_by_phase as (
  select coalesce(meta->>'phase', '(없음)') as phase, count(distinct user_id) as offered
  from ev where event = 'byeolmaru_subscribe_offer_shown'
  group by 1
),
funnel_by_phase as (
  select coalesce(o.phase, c.phase) as phase,
         coalesce(o.offered, 0) as offered,
         coalesce(c.clicked, 0) as clicked,
         coalesce(c.short_modal, 0) as short_modal,
         coalesce(c.sheet, 0) as sheet,
         coalesce(c.pay_start, 0) as pay_start,
         coalesce(c.paid, 0) as paid,
         coalesce(c.purchased, 0) as purchased
  from offered_by_phase o
  full join (
    select phase, count(*) as clicked,
           count(*) filter (where short_modal) as short_modal, count(*) filter (where sheet) as sheet,
           count(*) filter (where pay_start) as pay_start, count(*) filter (where paid) as paid,
           count(*) filter (where purchased) as purchased
    from click_steps group by phase
  ) c on c.phase = o.phase
),

-- 중복 없는 전체 — 사람 단위. purchasers 는 클릭 여부와 무관한 구독 행 실인원(정본)
funnel_overall as (
  select (select count(distinct user_id) from ev where event = 'byeolmaru_subscribe_offer_shown') as offered,
         (select count(distinct user_id) from ev where event = 'byeolmaru_subscribe_clicked') as clicked,
         (select count(distinct user_id) from ev where event = 'paywall_shown') as short_modal,
         (select count(distinct user_id) from ev where event = 'recharge_sheet_opened') as sheet,
         (select count(distinct user_id) from ev where event = 'recharge_payment_started') as pay_start,
         (select count(distinct user_id) from subs) as purchasers,
         (select count(distinct user_id) from ev where event = 'byeolmaru_subscribe_completed') as completed_users,
         (select count(distinct user_id) from ev where event = 'byeolmaru_subscribe_completed' and meta->>'resumed' = 'true') as completed_after_recharge,
         (select count(distinct user_id) from ev where event = 'byeolmaru_trial_started') as trial_started_users
),

failures as (
  select coalesce(meta->>'status', '-') as status, coalesce(meta->>'phase', '(없음)') as phase,
         count(*) as events, count(distinct user_id) as users
  from ev where event = 'byeolmaru_subscribe_failed'
  group by 1, 2
),

-- 날짜별 — 노출이 0 으로 떨어지면 화면이 고장 났다는 뜻이다(선택지를 그리는 자리가 넷뿐이라)
daily as (
  select ((created_at at time zone 'UTC' + interval '9 hours'))::date as kst_date,
         count(distinct user_id) filter (where event = 'byeolmaru_subscribe_offer_shown') as offered,
         count(distinct user_id) filter (where event = 'byeolmaru_subscribe_offer_shown' and meta->>'phase' = 'trial') as offered_trial,
         count(distinct user_id) filter (where event = 'byeolmaru_subscribe_clicked') as clicked,
         count(distinct user_id) filter (where event = 'byeolmaru_subscribe_completed') as completed,
         count(distinct user_id) filter (where event = 'byeolmaru_subscribe_failed') as failed
  from ev
  group by 1
),

broken_500 as (
  select 'error_log' as src,
         ((l.created_at at time zone 'UTC' + interval '9 hours'))::timestamp(0) as at_kst,
         left(l.user_id::text, 8) as user8,
         left(l.message, 160) as message,
         l.context as detail
  from error_logs l, params
  where params.deploy_at is not null and l.created_at >= params.deploy_at
    and l.route = '/api/byeolmaru/subscribe' and l.level = 'error'
    and (l.user_id is null or left(l.user_id::text, 8) not in (select p from ex))
  union all
  select 'client_failed_500',
         ((e.created_at at time zone 'UTC' + interval '9 hours'))::timestamp(0),
         left(e.user_id::text, 8),
         'byeolmaru_subscribe_failed status=500',
         e.meta
  from ev e
  where e.event = 'byeolmaru_subscribe_failed' and e.meta->>'status' = '500'
),
broken_no_row as (
  select ((e.created_at at time zone 'UTC' + interval '9 hours'))::timestamp(0) as completed_at_kst,
         left(e.user_id::text, 8) as user8,
         e.meta
  from ev e
  where e.event = 'byeolmaru_subscribe_completed'
    and not exists (
      select 1 from byeolmaru_subscriptions s
      where s.user_id = e.user_id
        and s.created_at between e.created_at - interval '10 minutes' and e.created_at + interval '1 minute'
    )
),
broken_double_row as (
  select left(a.user_id::text, 8) as user8,
         ((a.created_at at time zone 'UTC' + interval '9 hours'))::timestamp(0) as first_kst,
         ((b.created_at at time zone 'UTC' + interval '9 hours'))::timestamp(0) as second_kst,
         round(abs(extract(epoch from (b.created_at - a.created_at)))::numeric, 1) as gap_sec,
         a.stars_spent + b.stars_spent as stars_spent
  from subs a
  join subs b on b.user_id = a.user_id and b.id > a.id
   and b.created_at between a.created_at - interval '60 seconds' and a.created_at + interval '60 seconds'
),

sub_rows as (
  select x.*,
         case when x.extension then null
              when x.phase_at_purchase in ('pre_trial', 'no_trial_record') then 33
              when x.phase_at_purchase = 'trial'
                then 30 + ceil(extract(epoch from (x.trial_started_at + interval '3 days' - x.started_at)) / 86400.0)
              else 30 end as expected_days
  from (
    select left(s.user_id::text, 8) as user8, s.acquaintance,
           ((s.started_at at time zone 'UTC' + interval '9 hours'))::timestamp(0) as started_kst,
           s.started_at,
           round((extract(epoch from (s.expires_at - s.started_at)) / 86400.0)::numeric, 2) as len_days,
           s.stars_spent,
           u.byeolmaru_trial_started_at as trial_started_at,
           case
             when u.byeolmaru_trial_started_at is null then 'no_trial_record'
             -- 체험 전 구매는 구매 직후 체험을 기록한다(구독 라우트) — 체험 시작이 구매 직전·직후 1분 안이면 체험 전 구매다
             when u.byeolmaru_trial_started_at >= s.started_at - interval '1 minute' then 'pre_trial'
             when s.started_at < u.byeolmaru_trial_started_at + interval '3 days' then 'trial'
             else 'post_trial'
           end as phase_at_purchase,
           exists (select 1 from byeolmaru_subscriptions o
                   where o.user_id = s.user_id and o.id <> s.id
                     and o.started_at < s.started_at and o.expires_at > s.started_at) as extension
    from subs_all s
    join users u on u.id = s.user_id
  ) x
)

select 'window' as metric, to_jsonb(array_agg(x)) as value from win x
union all select 'reach',             to_jsonb(array_agg(r order by r.phase, r.surface)) from reach r
union all select 'funnel_by_phase',   to_jsonb(array_agg(f order by f.phase)) from funnel_by_phase f
union all select 'funnel_overall',    to_jsonb(array_agg(o)) from funnel_overall o
union all select 'failures',          to_jsonb(array_agg(x order by x.status, x.phase)) from failures x
union all select 'daily',             to_jsonb(array_agg(d order by d.kst_date)) from daily d
union all select 'broken_500',        to_jsonb(array_agg(b order by b.at_kst)) from broken_500 b
union all select 'broken_no_row',     to_jsonb(array_agg(b order by b.completed_at_kst)) from broken_no_row b
union all select 'broken_double_row', to_jsonb(array_agg(b order by b.first_kst)) from broken_double_row b
union all select 'sub_rows',
  to_jsonb(array_agg(jsonb_build_object(
    'user8', s.user8, 'acquaintance', s.acquaintance, 'started_kst', s.started_kst, 'len_days', s.len_days,
    'expected_days', s.expected_days, 'phase_at_purchase', s.phase_at_purchase, 'extension', s.extension,
    'stars_spent', s.stars_spent,
    'trial_started_kst', ((s.trial_started_at at time zone 'UTC' + interval '9 hours'))::timestamp(0)
  ) order by s.started_at)) from sub_rows s;
