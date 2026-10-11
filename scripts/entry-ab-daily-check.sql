-- 입구 반반(A/B) — 그룹별 일일 고장 감시. 🔴 판정이 아니다: 숫자가 앞서든 뒤지든 2주 전엔 멈추지 않는다
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/entry-ab-daily-check.sql
-- 스펙: docs/superpowers/specs/2026-10-11-타로-로그인전-맛보기-design.md §7
--
-- ▶ ENTRY_AB='split' prod 배포 뒤 첫 실행 전에 params 의 deploy_at 을 실제 배포 시각(KST)으로 바꾼다. 비어 있으면 경고만 나온다.
-- 그룹: 익명 쿠키(anon_id) 마지막 글자 짝수(0 2 4 6 8 a c e) = new, 홀수 = old — 앱의 entryArmOf(anonId) 와 같은 규칙
-- 멈춰야 하는 신호(고장일 때만 멈춘다):
--   pending_missing 이 날마다 이어진다         → 로그인·결제 뒤 복원 실패(저장 유실 · 다른 브라우저 귀환 급증)
--   daily 에서 한쪽만 신규 가입 0 이 2일 넘게   → 한쪽 흐름이 막혔다
--   login_roundtrip.fail_rate 가 기준선(≈6% = 스펙 §1 의 4/(4+64))보다 크게 높은 날이 이어진다 → 새 흐름 로그인 경로 고장
--                                                 사용자가 카카오에서 취소한 것(access_denied)은 fails_cancel 로 따로 본다 — 취소는 고장이 아니다
--                                                 (⚠️ fails 는 안내를 못 보여 주고 /tarot 로 빠진 경우도 센다 — events 의 login_sheet_shown trigger=fail 과 같이 읽을 것 ·
--                                                  같은 판을 새로고침하면 resume=login 이 남아 성공 복귀가 한 번 더 셀 수 있어 실패율이 조금 낮게 나온다)
--   arm_leak 에 행이 있다                       → 옛 그룹이 새 흐름 전용 화면(공개·로그인 창·고민 쓰기 위기 배너)을 봤다 — 그룹 판정·스위치 고장
--   price_changed 에서 after_24h=true 행이 이어진다 → 로그인 전후 가격 어긋남(MENU_AB 를 승자로 고정하지 않고 켰다)
--                                                 배포 순간 낡은 번들이 내는 PRICE_CHANGED 는 설계된 정상 신호라 배포 24시간 안(after_24h=false)은 고장으로 읽지 않는다.
--                                                 ⚠️ 메뉴판 쪽 409 와 구분하지 못한다 — 그래서 MENU_AB 를 승자로 고정한 뒤에 켠다
-- 진단(멈춤 신호 아님): exposure — 새 그룹 방문자가 홈에서 새 흐름을 못 탄 만큼 노출이 줄어 있다
-- 정의:
--   daily.visitors = 그날 첫 PV 가 생긴 익명 방문자 중 첫 PV utm_source='meta' · 첫 PV 비로그인 · 봇 제외
--   daily.signups  = 배포 뒤 가입한 신규 회원 — 그 회원의 첫 로그인 PV 의 anon_id 로 그룹을 가른다(지인 6명 제외)
--   events         = 배포 뒤 입구 이벤트를 anon_id 그룹 × 날짜 × 이벤트 × 키(flow·surface·via·trigger·reason·source)로
--                    (wallet_fetch_failed 는 exposure 용으로 같이 읽어 와 여기도 source 별로 보인다)
--   login_roundtrip = 새 그룹만 — 날짜별 카카오 로그인 왕복 결과. login_fail_shown 은 새 흐름 로그인 창 경로에서만 찍혀 옛 그룹은 실패해도 이벤트가 없다(그룹 비교 불가)
--     fails = login_fail_shown 수 · fails_cancel = 그중 reason='access_denied'(사용자가 카카오에서 취소)
--     returns_ok = pending_draw_resumed via='login' 중 loginFailed 표시가 없는 것(성공 복귀) · fail_rate = fails / (fails + returns_ok), 소수 3자리
--   login_fail      = 새 그룹의 login_fail_shown 을 날짜 × reason 으로
--   exposure        = 배포 뒤 홈 태그 탭(home_tag_clicked)을 그룹 × 날짜별로. flow='member' 탭은 뺀다
--     flow_new = 새 흐름을 탔다 · flow_old_before_wallet = 지갑 응답 전에 눌러 그룹을 모른 채 옛 흐름(armKnown=false)
--     flow_old_wallet_known = 지갑을 읽은 뒤인데 옛 흐름(armKnown=true) — 지갑 실패 폴백이거나 서버가 새 그룹을 옛 그룹으로 읽은 것
--     wallet_failed_home = 홈의 지갑 조회 실패(wallet_fetch_failed · source='home') — 로그인 전 방문자만
--     새 그룹 행에서 flow_old_* 가 클수록 새 흐름 노출이 줄어든다. 옛 그룹 행의 flow_old_* 는 정상(옛 흐름이 맞다) — 새 그룹 행만 읽을 것

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
  select e.event, e.meta, e.anon_id, e.user_id,
         ((e.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when position(lower(right(e.anon_id, 1)) in '02468ace') > 0 then 'new' else 'old' end as arm
  from ui_events e, params
  where params.deploy_at is not null and e.created_at >= params.deploy_at and e.anon_id is not null
    and e.event in ('home_tag_clicked', 'cards_revealed', 'login_sheet_shown', 'login_kakao_clicked',
                    'login_sheet_dismissed', 'login_fail_shown', 'pending_draw_resumed', 'pending_draw_missing',
                    'returning_short_shown', 'concern_safety_banner_shown', 'wallet_fetch_failed')
    and (e.user_id is null or left(e.user_id::text, 8) not in (select p from ex))
),
events as (
  select kst_date, arm, event,
         coalesce(meta->>'flow', meta->>'surface', meta->>'via', meta->>'trigger', meta->>'reason', meta->>'source', '-') as key,
         count(*) as n, count(distinct anon_id) as anons
  from ev
  group by 1, 2, 3, 4
),
pending_missing as (
  select kst_date, arm, meta->>'via' as via, count(*) as n
  from ev where event = 'pending_draw_missing'
  group by 1, 2, 3
),
-- 로그인 왕복 실패율 — 새 그룹만. 옛 그룹은 실패해도 이벤트가 없어(login_fail_shown 은 새 흐름 로그인 창 경로에서만 찍힌다) 그룹끼리 비교하면 늘 한쪽에 '몰려' 보인다
login_roundtrip as (
  select t.*, round(t.fails::numeric / nullif(t.fails + t.returns_ok, 0), 3) as fail_rate
  from (
    select kst_date,
           count(*) filter (where event = 'login_fail_shown') as fails,
           count(*) filter (where event = 'login_fail_shown' and meta->>'reason' = 'access_denied') as fails_cancel,
           count(*) filter (where event = 'pending_draw_resumed' and meta->>'via' = 'login' and meta->>'loginFailed' is null) as returns_ok
    from ev
    where arm = 'new' and event in ('login_fail_shown', 'pending_draw_resumed')
    group by 1
  ) t
),
login_fail as (
  select kst_date, meta->>'reason' as reason, count(*) as n
  from ev where arm = 'new' and event = 'login_fail_shown'
  group by 1, 2
),
-- 노출 어긋남(진단) — 홈 태그 탭이 어느 흐름을 탔나(flow='member' 는 뺀다) + 홈의 지갑 조회 실패. 새 그룹 행에서 flow_new 가 작을수록 노출이 샌다
exposure as (
  select kst_date, arm,
         count(*) filter (where event = 'home_tag_clicked' and meta->>'flow' = 'new') as flow_new,
         count(*) filter (where event = 'home_tag_clicked' and meta->>'flow' = 'old' and meta->>'armKnown' = 'false') as flow_old_before_wallet,
         count(*) filter (where event = 'home_tag_clicked' and meta->>'flow' = 'old' and meta->>'armKnown' = 'true') as flow_old_wallet_known,
         count(*) filter (where event = 'wallet_fetch_failed' and user_id is null and meta->>'source' = 'home') as wallet_failed_home
  from ev
  where event in ('home_tag_clicked', 'wallet_fetch_failed')
  group by 1, 2
),
arm_leak as (
  select event, count(*) as events, count(distinct anon_id) as anons
  from ev
  where arm = 'old'
    and (event in ('cards_revealed', 'login_sheet_shown', 'login_sheet_dismissed', 'concern_safety_banner_shown')
         or (event = 'login_kakao_clicked' and meta->>'surface' = 'draw_sheet'))
  group by 1
),
price_changed as (
  select ((l.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         (l.created_at >= params.deploy_at + interval '24 hours') as after_24h,
         count(*) as warns
  from error_logs l, params
  where params.deploy_at is not null and l.created_at >= params.deploy_at
    and l.level = 'warn' and left(l.message, 14) = 'PRICE_CHANGED:'
    and (l.user_id is null or left(l.user_id::text, 8) not in (select p from ex))   -- 지인 테스트 409 가 멈춤 신호로 읽히지 않게(menu-ab-daily-check 와 같은 제외)
  group by 1, 2
)

select 'window' as metric, to_jsonb(array_agg(x)) as value from win x
union all select 'daily',           to_jsonb(array_agg(d order by d.kst_date, d.arm)) from daily d
union all select 'events',          to_jsonb(array_agg(e order by e.kst_date, e.arm, e.event, e.key)) from events e
union all select 'pending_missing', to_jsonb(array_agg(m order by m.kst_date, m.arm)) from pending_missing m
union all select 'login_roundtrip', to_jsonb(array_agg(r order by r.kst_date)) from login_roundtrip r
union all select 'login_fail',      to_jsonb(array_agg(f order by f.kst_date, f.reason)) from login_fail f
union all select 'exposure',        to_jsonb(array_agg(x order by x.kst_date, x.arm)) from exposure x
union all select 'arm_leak',        to_jsonb(array_agg(a order by a.event)) from arm_leak a
union all select 'price_changed',   to_jsonb(array_agg(p order by p.kst_date, p.after_24h)) from price_changed p;
