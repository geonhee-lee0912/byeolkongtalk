-- 메뉴판 반반(A/B) — 그룹별 일일 고장 감시. 🔴 판정이 아니다: 숫자가 앞서든 뒤지든 2주 전엔 멈추지 않는다
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/menu-ab-daily-check.sql
-- 스펙: docs/superpowers/specs/2026-10-05-타로톡-메뉴판-별경제-design.md §9 · §9-1
--
-- ▶ prod 배포 뒤 첫 실행 전에 아래 params 의 deploy_at 을 실제 배포 시각(KST)으로 바꾼다. 비어 있으면 경고만 나온다.
-- ▶ 스위치 = split 을 전제한다(MENU_AB='split' 배포 뒤에만 그룹 비교가 의미 있다 — 'legacy'·'menu' 로 잠긴 동안엔 한쪽이 전원이다).
--
-- 그룹: user_id 마지막 글자 짝수(0 2 4 6 8 a c e) = menu, 홀수 = legacy — 앱의 menuArm(userId) 와 같은 규칙
-- 멈춰야 하는 신호(고장일 때만 멈춘다):
--   price_mismatch 에 행이 있다            → 그룹 가격과 실제 차감 별이 다르다(가격 함수가 그룹을 안 따른다)
--   errors 가 한쪽 그룹에만 몰린다          → 한쪽 화면·결제가 깨졌을 수 있다 — top_messages 로 확인
--   daily 에서 한쪽만 결제 0 이 2일 넘게 이어지고 다른 쪽은 정상
--   wallet_fail 의 kind='harmful' 행이 menu 쪽에 있다 → 메뉴판 그룹이 지갑을 못 읽어 옛 화면·옛 가격·옛 진열을 봤다(legacy 쪽 건수와 같이 볼 것)
--   cross_arm_packages 에 행이 있다         → 상대 그룹 진열에만 있는 패키지가 결제됐다. 배포 순간 열려 있던 결제창이면 첫날 한두 건은 정상이고, 이후에도 나오면 진열 고장
--   arm_leak 의 events 가 1 이상이다       → 옛 그룹이 메뉴판 전용 화면(메뉴판·비교 창·맛보기 끝 이어서 깊게)을 봤다 — 그룹 판정·스위치 고장
--   price_changed 가 배포 하루 뒤에도 이어진다 → 새 화면이 expectedCost 를 빠뜨린 고장(missing_expected 쪽). 배포 직후 잠깐 몰리는 건 정상(배포 순간 낡은 탭)
--     — 단 며칠 열어 둔 탭의 이어가기 팝업(화면 이동 없이 POST)은 하루 뒤에도 한두 건 낼 수 있다. 같은 유저 반복인지 users 로 볼 것
--   ⚠️ errors·top_messages 의 warn 엔 PRICE_CHANGED(설계된 정상 신호, 대부분 menu 쪽)도 섞인다 — "한쪽에 몰림"으로 읽기 전에 price_changed 로 빼 볼 것
-- 정의:
--   daily = 그날 활동(기존 유저 포함). 신규 가입은 배포 뒤 가입만
--   price_mismatch = 배포 뒤 타로 리딩 — 새 리딩·이어가기 fresh 는 정가, 이어가기 deep 은 round(정가 × 0.6)(lib/continuation.ts continuationPrice 와 같은 식 ·
--     deep 행의 spread_type 은 부모 것을 복사해 둔 값). 스킬 리딩 · 0별 · spread_type NULL 제외
--     spread_type NULL 제외 = 운세 '오늘의 타로'를 되살리면 consultation_type='tarot' · spread_type NULL 로 들어와 '기대 가격 없음'으로 오탐한다
--   price_ok.deep_checked = 그중 deep 이어가기 수(대조가 deep 까지 도는지 보는 용)
--   wallet_fail = 배포 뒤 wallet_fetch_failed(ui_events)를 그룹 × 날짜 × 지갑을 읽은 지면(meta.source) × 실패 모양(meta.status)별로 센 것. 로그인 유저만(그룹을 안다)
--     events = 건수 · users = 유저 수. 가격 대조(price_mismatch)는 서버 값끼리라 이 표시 고장을 못 잡는다
--     kind: harmful(tarot_router·tarot_draw·recharge_sheet·shop·continuation_modal) = 실패하면 메뉴판 그룹이 옛 화면·가격·진열을 보거나 버튼이 잠긴다 → 이것만 "고장"으로 센다
--           harmless(home·reading_end·result) = 알약·카드가 안 뜰 뿐이라 참고용 · unknown = 이 파일이 모르는 지면(지면을 더하고 아래 wallet_fail 에 안 적었다)
--     status: 'timeout'(5초 초과) · 'network'(연결 끊김) · HTTP 숫자(5xx 서버·콜드 스타트 / 401 세션 / 200 본문 깨짐) — 처방이 다르다
--     ⚠️ continuation_modal 은 사주 부모의 실패(무해)도 같은 라벨로 센다 — 라벨로 못 가른다
--   cross_arm_packages = 배포 뒤 완료 결제 중 상대 그룹 진열에만 있는 패키지(메뉴판 그룹이 산 star_150·star_300 / 옛 그룹이 산 star_55·star_130). 날짜 × 패키지별
--   arm_leak = 배포 뒤 옛 그룹 user_id 가 남긴 메뉴판 전용 이벤트(menu_only_events) — 이벤트별, 0 인 이벤트도 행으로 보인다. 0 이 정상
--   menu_off_catalog = 배포 뒤 메뉴판 그룹의 이어가기 아닌 타로 리딩 중 (emotion_tag, spread_type) 이 메뉴 카탈로그 32개(menu_catalog) 밖인 것
--     → 메뉴판 유저가 옛 고르기 화면으로 샀다. 지갑 실패 비콘(wallet_fail · tarot_router)과 독립된 서버 쪽 확인 — 비콘이 못 간 폴백도 잡는다
--     ⚠️ 하한이다 — 카탈로그 32개는 옛 큐레이션에도 다 있어, 폴백된 유저가 그중 하나를 고르면 못 잡는다. 스킬 · 0별 · spread_type NULL 제외
--   price_changed = 배포 뒤 PRICE_CHANGED WARN(화면이 본 가격 ≠ 서버 가격 → 409, 차감 없음 · 설계된 정상 신호)을 그룹(user_id 끝 글자 · NULL = unknown) × 날짜 × 라우트로
--     missing_expected = 화면이 expectedCost 를 안 보낸 건(옛 번들 · 새 화면 누락) · 나머지는 숫자를 보냈는데 달랐던 건(그룹 전환 배포 · 같은 탭 계정 전환)
--   interim_not_verdict = 배포 뒤 가입자의 48시간 지표. 성숙(가입 48시간 경과)만 센다
--   지인 6명 제외(8자 prefix)

with
params as (select timestamptz '2026-10-09 21:29:15+09' as deploy_at),   -- 2026-10-09 #3 prod 배포(4d3eed86, 카드 문구) 완료 12:29:15Z — #2(21:05)에서 판정 창을 다시 시작
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

win as (
  select deploy_at,
         ((now() at time zone 'UTC' + interval '9 hours'))::timestamp(0) as run_at_kst,
         ((deploy_at at time zone 'UTC' + interval '9 hours'))::timestamp(0) as deploy_kst,
         round((extract(epoch from now() - deploy_at) / 86400.0)::numeric, 1) as days_since_deploy,
         ((deploy_at + interval '14 days' + interval '48 hours') at time zone 'UTC' + interval '9 hours')::timestamp(0)
           as verdict_run_on_or_after_kst,
         case when deploy_at is null then '⚠️ deploy_at 이 비었다 — params 에 prod 배포 시각(KST)을 넣고 다시 실행' end as warning
  from params
),

-- 배포 뒤 가입자
u as (
  select us.id as user_id, us.created_at as signup_at,
         case when position(right(us.id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm,
         exists (select 1 from user_acquisition a where a.user_id = us.id and a.utm_source = 'meta') as is_meta
  from users us, params
  where us.created_at >= params.deploy_at
    and left(us.id::text, 8) not in (select p from ex)
),

-- 그날 활동(기존 유저 포함)
pay as (
  select ((p.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when position(right(p.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm,
         p.amount_won, p.package_type, p.user_id
  from payments p, params
  where p.status = 'completed' and p.created_at >= params.deploy_at
    and p.user_id is not null and left(p.user_id::text, 8) not in (select p2.p from ex p2)
),
rd as (
  select r.*,
         ((r.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when position(right(r.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm
  from readings r, params
  where r.consultation_type = 'tarot' and r.created_at >= params.deploy_at
    and left(r.user_id::text, 8) not in (select p from ex)
),
pw as (
  select distinct e.user_id,
         ((e.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when position(right(e.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm
  from ui_events e, params
  where e.event = 'paywall_shown' and e.created_at >= params.deploy_at
    and e.user_id is not null and left(e.user_id::text, 8) not in (select p from ex)
),
days as (
  select g.d::date as kst_date, a.arm
  from params,
       generate_series(((params.deploy_at at time zone 'UTC' + interval '9 hours'))::date::timestamp,
                       ((now() at time zone 'UTC' + interval '9 hours'))::date::timestamp,
                       interval '1 day') g(d),
       (values ('menu'), ('legacy')) a(arm)
  where params.deploy_at is not null
),
daily as (
  select d.kst_date, d.arm,
         (select count(*) from u where ((u.signup_at at time zone 'UTC' + interval '9 hours')::date) = d.kst_date
                                   and u.arm = d.arm) as new_signups,
         (select count(*) from rd where rd.kst_date = d.kst_date and rd.arm = d.arm) as tarot_readings,
         (select count(*) from pw where pw.kst_date = d.kst_date and pw.arm = d.arm) as paywall_users,
         (select count(*) from pay where pay.kst_date = d.kst_date and pay.arm = d.arm) as payments,
         (select coalesce(sum(amount_won), 0) from pay where pay.kst_date = d.kst_date and pay.arm = d.arm) as revenue_won
  from days d
),

-- 그룹 가격 대조 (스펙 §9-1 표) — 새 리딩·이어가기 fresh = 정가 · deep = round(정가 × 0.6)
-- deep 행의 spread_type 은 이어가기 라우트가 부모 것을 그대로 복사해 둔다(같은 카드) — 부모를 다시 볼 필요 없다
price as (
  select rd.arm, rd.spread_type, rd.stars_spent, coalesce(rd.continuation_mode, '-') as continuation_mode,
         case when rd.spread_type = 'one_card' then 1
              when rd.spread_type = 'two_card' then 2
              when rd.spread_type = 'three_card' then 3
              when right(rd.spread_type, 2) = '_5' then 5
              when right(rd.spread_type, 2) = '_6' then 6
              when right(rd.spread_type, 2) = '_7' then 7 end as cards
  from rd
  where rd.skill_key is null and rd.stars_spent > 0
    and rd.spread_type is not null   -- 운세 '오늘의 타로'(tarot · spread_type NULL)를 되살려도 '기대 가격 없음'으로 오탐하지 않게
),
-- deep 의 0.6 은 lib/continuation.ts CONTINUATION_DISCOUNT_RATE 의 사본 — 정수 × 0.6 은 numeric 이라 round 가 JS Math.round 와 같은 쪽(pricing.test.ts 가 대조)
price2 as (
  select p.*,
         case when p.continuation_mode = 'deep' then round(p.full_price * 0.6) else p.full_price end as expected
  from (
    select price.*,
           case price.arm
             when 'menu'   then case cards when 1 then 15 when 2 then 15 when 3 then 25 when 5 then 55 when 6 then 55 when 7 then 70 end
             when 'legacy' then case cards when 1 then 10 when 2 then 15 when 3 then 25 when 5 then 40 when 6 then 45 when 7 then 55 end
           end as full_price
    from price
  ) p
),
price_mismatch as (
  select arm, spread_type, continuation_mode, stars_spent, expected, count(*) as readings
  from price2
  where expected is null or stars_spent <> expected
  group by 1, 2, 3, 4, 5
),
price_ok as (
  select arm, count(*) filter (where stars_spent = expected) as matched,
         count(*) filter (where expected is null or stars_spent <> expected) as mismatched,
         count(*) filter (where continuation_mode = 'deep') as deep_checked
  from price2 group by 1
),

-- 에러(로그인 유저만 그룹을 안다)
err as (
  select case when l.user_id is null then 'unknown'
              when position(right(l.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm,
         l.level, coalesce(l.route, l.source, '-') as where_, left(l.message, 120) as message
  from error_logs l, params
  where l.created_at >= params.deploy_at
    and (l.user_id is null or left(l.user_id::text, 8) not in (select p from ex))
),
errors as (
  select arm, level, count(*) as n from err group by 1, 2
),
top_messages as (
  select * from (
    select arm, level, where_, message, count(*) as n,
           row_number() over (partition by arm order by count(*) desc) as rk
    from err where level in ('error', 'warn')
    group by 1, 2, 3, 4
  ) t where rk <= 5
),

-- 지갑 조회 실패 — 화면이 지갑을 못 읽으면 스위치가 정한 비로그인 그룹(반반 중엔 옛 그룹)으로 떨어진다(lib/wallet.ts fetchWallet).
-- 지면(meta.source)별로 센다: kind 의 뜻은 위 정의. 새 지면을 더하면 이 case 의 두 목록에 같이 적을 것(wallet.test.ts 가 대조)
wf as (
  select ((e.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when position(right(e.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm,
         coalesce(e.meta->>'source', '(없음)') as source,
         coalesce(e.meta->>'status', '(없음)') as status,   -- 'timeout' · 'network' · HTTP 숫자(lib/wallet.ts fetchWallet)
         e.user_id
  from ui_events e, params
  where e.event = 'wallet_fetch_failed' and e.created_at >= params.deploy_at
    and e.user_id is not null and left(e.user_id::text, 8) not in (select p from ex)
),
wallet_fail as (
  select arm, kst_date, source,
         case when source in ('tarot_router', 'tarot_draw', 'recharge_sheet', 'shop', 'continuation_modal') then 'harmful'
              when source in ('home', 'reading_end', 'result') then 'harmless'
              else 'unknown' end as kind,
         status,
         count(*) as events, count(distinct user_id) as users
  from wf
  group by 1, 2, 3, 4, 5
),

-- 상대 그룹 진열에만 있는 패키지를 산 결제 — 두 목록은 lib/constants.ts SHOP_PACKAGE_IDS 의 그룹별 단독 패키지다(menu-ab.test.ts 가 대조).
-- 메뉴판 그룹 진열 = 10·30·55·70·130 / 옛 그룹 = 10·30·70·150·300 이라, 메뉴판 그룹이 150·300 을, 옛 그룹이 55·130 을 산 것만 센다
cross_arm_packages as (
  select arm, kst_date, package_type,
         count(*) as payments, count(distinct user_id) as users, coalesce(sum(amount_won), 0) as revenue_won
  from pay
  where (arm = 'menu' and package_type in ('star_150', 'star_300'))
     or (arm = 'legacy' and package_type in ('star_55', 'star_130'))
  group by 1, 2, 3
),

-- 그룹 누출 — 메뉴판·비교 창·맛보기 끝 이어서 깊게는 지갑의 menuArm 이 'menu' 일 때만 그려진다. 옛 그룹이 이 이벤트를 남기면 고장(0 이 정상)
-- 이름은 lib/analytics/ui-events.ts UI_EVENTS 의 사본(menu-ab.test.ts 가 대조 — 오타가 나면 누출이 늘 0 으로 조용히 통과한다)
menu_only_events(event) as (values
  ('tarot_menu_viewed'), ('tarot_product_selected'), ('tarot_compare_opened'),
  ('tarot_compare_confirmed'), ('teaser_upsell_shown'), ('teaser_upsell_clicked')
),
leak as (
  select e.event, e.user_id,
         case when position(right(e.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm
  from ui_events e, params
  where e.created_at >= params.deploy_at
    and e.event in (select m.event from menu_only_events m)
    and e.user_id is not null and left(e.user_id::text, 8) not in (select p from ex)
),
arm_leak as (
  select m.event, count(l.user_id) as events, count(distinct l.user_id) as users
  from menu_only_events m
  left join leak l on l.event = m.event and l.arm = 'legacy'
  group by m.event
),

-- 메뉴 카탈로그 32개 = lib/tarot/menu.ts getMenu 전체의 (emotion_tag, spread_type) — 메뉴를 바꾸면 여기도 같이(menu-ab.test.ts 가 대조)
menu_catalog(emotion_tag, spread_type) as (values
  ('걔 속마음이 궁금해', 'one_card'), ('걔 속마음이 궁금해', 'three_card'), ('걔 속마음이 궁금해', 'deep_feelings_5'), ('걔 속마음이 궁금해', 'potential_7'),
  ('재회할 수 있을까', 'one_card'), ('재회할 수 있을까', 'three_card'), ('재회할 수 있을까', 'reunion_5'), ('재회할 수 있을까', 'reunion_deep_7'),
  ('언제 연락 올까, 타이밍이 궁금해', 'one_card'), ('언제 연락 올까, 타이밍이 궁금해', 'three_card'), ('언제 연락 올까, 타이밍이 궁금해', 'relationship_5'),
  ('썸, 이 관계 어떻게 될까', 'one_card'), ('썸, 이 관계 어떻게 될까', 'three_card'), ('썸, 이 관계 어떻게 될까', 'relationship_5'),
  ('요즘 우리, 예전 같지 않아', 'one_card'), ('요즘 우리, 예전 같지 않아', 'three_card'), ('요즘 우리, 예전 같지 않아', 'checkin_6'),
  ('새로운 인연, 언제쯤 올까', 'one_card'), ('새로운 인연, 언제쯤 올까', 'three_card'), ('새로운 인연, 언제쯤 올까', 'new_love_5'),
  ('진로·방향이 고민이야', 'one_card'), ('진로·방향이 고민이야', 'three_card'), ('진로·방향이 고민이야', 'stay_or_go_6'),
  ('어떤 선택이 맞을지 모르겠어', 'one_card'), ('어떤 선택이 맞을지 모르겠어', 'three_card'), ('어떤 선택이 맞을지 모르겠어', 'stay_or_go_6'),
  ('직장·학교에서 사람이 어려워', 'one_card'), ('직장·학교에서 사람이 어려워', 'three_card'), ('직장·학교에서 사람이 어려워', 'deep_feelings_5'),
  ('그냥 별콩이한테 털어놓고 싶어', 'one_card'), ('그냥 별콩이한테 털어놓고 싶어', 'three_card'), ('그냥 별콩이한테 털어놓고 싶어', 'healing_6')
),
-- 메뉴판 그룹의 이어가기 아닌 리딩이 카탈로그 밖 = 옛 고르기 화면으로 샀다(지갑 실패 비콘과 독립된 서버 쪽 확인 · 하한).
-- emotion_tag NULL 은 카탈로그와 같을 수 없어(NULL = … 은 참이 아니다) 밖으로 센다 — 있으면 그 자체가 이상이라 보이게 둔다
menu_off_catalog as (
  select rd.kst_date, rd.emotion_tag, rd.spread_type, count(*) as readings, count(distinct rd.user_id) as users
  from rd
  where rd.arm = 'menu'
    and rd.continuation_mode is null
    and rd.skill_key is null and rd.stars_spent > 0 and rd.spread_type is not null
    and not exists (select 1 from menu_catalog c where c.emotion_tag = rd.emotion_tag and c.spread_type = rd.spread_type)
  group by 1, 2, 3
),

-- 화면 가격 대조 409(PRICE_CHANGED) WARN — 설계된 정상 신호. 앞머리는 left(…) = 로 비교한다(LIKE 의 _ 는 한 글자 와일드카드)
pc as (
  select ((l.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         case when l.user_id is null then 'unknown'
              when position(right(l.user_id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm,
         coalesce(l.route, '-') as route, l.user_id, l.context->>'expected' as expected
  from error_logs l, params
  where l.created_at >= params.deploy_at
    and l.level = 'warn' and left(l.message, 14) = 'PRICE_CHANGED:'
    and (l.user_id is null or left(l.user_id::text, 8) not in (select p from ex))
),
price_changed as (
  select arm, kst_date, route, count(*) as warns, count(distinct user_id) as users,
         count(*) filter (where expected = 'missing') as missing_expected
  from pc
  group by 1, 2, 3
),

-- 판정 아님 — 배포 뒤 가입자의 48시간 지표(성숙만)
uf as (
  select u.*,
         u.signup_at <= now() - interval '48 hours' as mature,
         (select coalesce(sum(p.amount_won), 0) from payments p
           where p.user_id = u.user_id and p.status = 'completed'
             and p.created_at < u.signup_at + interval '48 hours') as rev48
  from u
),
interim as (
  select arm, 'all' as cohort,
         count(*) as signups, count(*) filter (where mature) as mature,
         count(*) filter (where mature and rev48 > 0) as payers48,
         coalesce(sum(rev48) filter (where mature), 0) as rev48,
         round(coalesce(sum(rev48) filter (where mature), 0)::numeric / nullif(count(*) filter (where mature), 0)) as rev48_per_signup,
         round(100.0 * max(rev48) filter (where mature) / nullif(sum(rev48) filter (where mature), 0), 1) as top1_share_pct
  from uf group by arm
  union all
  select arm, 'meta' as cohort,
         count(*), count(*) filter (where mature),
         count(*) filter (where mature and rev48 > 0),
         coalesce(sum(rev48) filter (where mature), 0),
         round(coalesce(sum(rev48) filter (where mature), 0)::numeric / nullif(count(*) filter (where mature), 0)),
         round(100.0 * max(rev48) filter (where mature) / nullif(sum(rev48) filter (where mature), 0), 1)
  from uf where is_meta group by arm
)

select 'window' as metric, to_jsonb(array_agg(x)) as value from win x
union all select 'price_mismatch',      to_jsonb(array_agg(m order by m.arm, m.spread_type)) from price_mismatch m
union all select 'price_ok',            to_jsonb(array_agg(o order by o.arm)) from price_ok o
union all select 'errors',              to_jsonb(array_agg(e order by e.arm, e.level)) from errors e
union all select 'top_messages',        to_jsonb(array_agg(t order by t.arm, t.rk)) from top_messages t
union all select 'wallet_fail',         to_jsonb(array_agg(w order by w.kst_date, w.arm, w.kind, w.source, w.status)) from wallet_fail w
union all select 'cross_arm_packages',  to_jsonb(array_agg(c order by c.kst_date, c.arm, c.package_type)) from cross_arm_packages c
union all select 'arm_leak',            to_jsonb(array_agg(a order by a.event)) from arm_leak a
union all select 'menu_off_catalog',    to_jsonb(array_agg(o order by o.kst_date, o.emotion_tag, o.spread_type)) from menu_off_catalog o
union all select 'price_changed',       to_jsonb(array_agg(pcd order by pcd.kst_date, pcd.arm, pcd.route)) from price_changed pcd
union all select 'daily',               to_jsonb(array_agg(d order by d.kst_date, d.arm)) from daily d
union all select 'interim_not_verdict', to_jsonb(array_agg(i order by i.cohort, i.arm)) from interim i;
