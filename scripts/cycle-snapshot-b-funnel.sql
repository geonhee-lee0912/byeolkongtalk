-- 판정 사이클 스냅샷 B — 상담 퍼널 · 종료 트리거 · "우리 사이" 첫 발화
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/cycle-snapshot-b-funnel.sql
--
-- day 0 = 2026-07-26 (픽스 패키지 prod 배포 48f95bb). d4=7/30 · d7=8/2 · d14=8/9 · d21=8/16 · d28=8/23
--
-- ⚠️ 버킷 = **KST 자정**. 2026-07-31 부터 page_views 계열(a-retention·정답지·화면 RPC)도 자정으로
--    통일됐다 — 이제 전 스냅샷이 같은 기준이라 나란히 읽어도 된다(이전엔 10시 롤오버라 섞으면 안 됐다).
-- ⚠️ 운세(one-shot 리포트)는 emotion_tag like 'fortune:%' 로 배제 — assistant 1건뿐이라 퍼널 개념이 없다
-- ⚠️ 관계 스레드(consultation_type='relationship')는 종결 개념이 없어 [END] 가 안 붙는다.
--    그런데 정답지의 고정점(642/406/326)에는 섞여 있다 → consult_by_type 으로 오염 규모를 노출한다
-- ⚠️ turn-1 "출구칩 노출"은 DB 에 흔적이 0이다 (클라 로컬 상태 setExitOffer, API 호출 없음).
--    관측 가능한 건 **클릭**뿐 — 고정 유저 문구로 식별한다:
--      '오늘은 여기서 마무리할게' = 출구 칩 (app/tarot/reading/page.tsx:58)
--      '대화 마무리할게'          = 하단 골드 버튼 (동 파일 :57)

with
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

meta as (
  select now() as run_at,
         ((now() at time zone 'UTC' + interval '9 hours')::date) as today_kst,
         (((now() at time zone 'UTC')::date) - date '2026-07-26') as cycle_day
),

-- ── 상담 reading 모수 (운세 제외) ──
base as (
  select r.id, r.user_id, r.consultation_type, r.spread_type, r.stars_spent,
         r.result_viewed_at, r.created_at, r.prompt_version, r.relationship_id,
         r.skill_key, r.emotion_tag, r.clarifier_count, r.extra_turns,
         r.continuation_mode, r.previous_reading_id,
         ((r.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         left(r.user_id::text, 8) in (select p from ex) as is_admin
  from readings r
  where coalesce(r.emotion_tag,'') not like 'fortune:%'
),
flags as (
  select b.*,
         exists (select 1 from messages m
                 where m.reading_id = b.id and m.role = 'assistant' and m.content like '%[END]%') as has_end,
         (select count(*) from messages m where m.reading_id = b.id and m.role = 'user')      as user_turns,
         (select count(*) from messages m where m.reading_id = b.id and m.role = 'assistant') as asst_turns
  from base b
),
-- 마지막 유저 발화 = 종료 트리거 판별
last_user as (
  select distinct on (m.reading_id) m.reading_id, m.content
  from messages m where m.role = 'user'
  order by m.reading_id, m.created_at desc, m.id desc
),
trig as (
  select f.*,
         case when lu.content = '대화 마무리할게'            then '2_btn_finish'
              when lu.content = '오늘은 여기서 마무리할게'   then '1_exit_chip'
              when lu.content like '%마무리%'                then '3_other_wrapup'
              when lu.content is null                        then '5_no_user_msg'
              else '4_no_close_signal' end as close_sig
  from flags f left join last_user lu on lu.reading_id = f.id
),

-- ══ 1. 30일창 퍼널 — 정답지와 동일 조건(어드민 미제외) = d3 대조용 ══
funnel_raw as (
  select count(*) as started,
         count(*) filter (where has_end) as ended,
         count(*) filter (where has_end and result_viewed_at is not null) as viewed,
         count(*) filter (where has_end and result_viewed_at is null) as unviewed,
         round(100.0 * count(*) filter (where has_end) / nullif(count(*),0), 1) as complete_pct,
         round(100.0 * count(*) filter (where has_end and result_viewed_at is not null)
               / nullif(count(*) filter (where has_end),0), 1) as view_pct
  from flags where created_at >= now() - interval '30 days'
),
-- 어드민 제외판 (판정에 쓸 값)
funnel_excl as (
  select count(*) as started,
         count(*) filter (where has_end) as ended,
         count(*) filter (where has_end and result_viewed_at is not null) as viewed,
         count(*) filter (where has_end and result_viewed_at is null) as unviewed,
         round(100.0 * count(*) filter (where has_end) / nullif(count(*),0), 1) as complete_pct,
         round(100.0 * count(*) filter (where has_end and result_viewed_at is not null)
               / nullif(count(*) filter (where has_end),0), 1) as view_pct
  from flags where created_at >= now() - interval '30 days' and not is_admin
),
-- 고정점 오염 규모: 종류별 분해
consult_by_type as (
  select consultation_type,
         case when skill_key is not null then 'skill' when relationship_id is not null then 'rel_thread' else 'main' end as kind,
         count(*) as n,
         count(*) filter (where has_end) as ended,
         count(*) filter (where result_viewed_at is not null) as viewed,
         count(*) filter (where is_admin) as admin_rows
  from flags where created_at >= now() - interval '30 days'
  group by 1,2 order by 3 desc
),

-- ══ 2. 일별 퍼널 (d0 전후, 어드민 제외, 타로·사주 본체만) ══
daily as (
  select kst_date,
         count(*) as started,
         count(*) filter (where has_end) as ended,
         count(*) filter (where has_end and result_viewed_at is not null) as viewed,
         count(*) filter (where has_end and result_viewed_at is null) as unviewed,
         count(*) filter (where user_turns = 1) as one_turn,
         count(*) filter (where stars_spent > 0) as paid,
         round(avg(user_turns)::numeric, 2) as avg_user_turns,
         round(100.0 * count(*) filter (where has_end) / nullif(count(*),0), 1) as complete_pct
  from flags
  where not is_admin and consultation_type in ('saju','tarot')
    and skill_key is null and created_at >= now() - interval '21 days'
  group by 1 order by 1
),

-- ══ 3. 종료 트리거 × 열람 (출구칩 클릭 효과) ══
close_mix as (
  select close_sig,
         count(*) as n,
         count(*) filter (where has_end) as has_end,
         count(*) filter (where result_viewed_at is not null) as viewed,
         round(100.0 * count(*) filter (where result_viewed_at is not null) / nullif(count(*),0), 1) as view_pct,
         round(avg(user_turns)::numeric, 2) as avg_turns
  from trig
  where not is_admin and consultation_type in ('saju','tarot') and skill_key is null
    and created_at >= now() - interval '30 days'
  group by 1 order by 1
),
-- 출구칩은 d0 배포분 → 전후 비교
close_prepost as (
  select case when created_at >= '2026-07-26T01:00:00Z' then 'post_d0' else 'pre_d0' end as cohort,
         count(*) as n,
         count(*) filter (where close_sig = '1_exit_chip') as exit_chip,
         count(*) filter (where close_sig = '2_btn_finish') as btn_finish,
         count(*) filter (where close_sig = '4_no_close_signal') as no_signal,
         count(*) filter (where user_turns = 1) as one_turn,
         count(*) filter (where user_turns = 1 and result_viewed_at is not null) as one_turn_viewed,
         round(100.0 * count(*) filter (where close_sig = '1_exit_chip') / nullif(count(*),0), 1) as exit_chip_pct
  from trig
  where not is_admin and consultation_type in ('saju','tarot') and skill_key is null
    and created_at >= '2026-07-19T01:00:00Z'
  group by 1 order by 1
),

-- ══ 4. "우리 사이" 등록 → 첫 발화 (무료 인트로 3턴 = d0 배포) ══
-- ⚠️ 무료 턴 사용량은 DB 컬럼이 아니다 — 요청마다 messages COUNT 로 재계산되는 파생값.
--    게이트(app/api/relationship/chat/route.ts:146-163)는 skill_key 필터가 **없다**(전체 user 메시지).
--    반면 일일 소프트캡은 skill_key IS NULL 만 센다 — 두 카운트를 섞지 말 것.
rel as (
  select rl.id, rl.user_id, rl.status, rl.created_at, rl.thread_reading_id, rl.last_visited_at,
         left(rl.user_id::text, 8) in (select p from ex) as is_admin,
         (select count(*) from messages m
            where m.reading_id = rl.thread_reading_id and m.role = 'user') as user_msgs,
         (select count(*) from messages m
            where m.reading_id = rl.thread_reading_id and m.role = 'user' and m.skill_key is null) as thread_msgs,
         (select count(*) from relationship_passes rp where rp.relationship_id = rl.id) as passes,
         (select coalesce(sum(rp.stars_spent),0) from relationship_passes rp where rp.relationship_id = rl.id) as pass_stars
  from relationships rl
),
rel_cohort as (
  select case when created_at >= '2026-07-26T01:00:00Z' then 'post_d0' else 'pre_d0' end as cohort,
         count(*) as registrations,
         count(*) filter (where user_msgs > 0) as spoke,
         round(100.0 * count(*) filter (where user_msgs > 0) / nullif(count(*),0), 1) as spoke_pct,
         count(*) filter (where user_msgs >= 3) as used_all_free,
         count(*) filter (where passes > 0) as bought_pass,
         round(100.0 * count(*) filter (where passes > 0) / nullif(count(*),0), 1) as pass_pct,
         sum(pass_stars) as pass_stars,
         count(*) filter (where thread_reading_id is null) as no_thread
  from rel where not is_admin group by 1 order by 1
),
-- 무료 3턴 소진 분포 (post_d0)
rel_turn_dist as (
  select least(user_msgs, 6) as user_msgs_capped, count(*) as n,
         count(*) filter (where passes > 0) as bought_pass
  from rel where not is_admin and created_at >= '2026-07-26T01:00:00Z'
  group by 1 order by 1
),
rel_daily as (
  select ((created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         count(*) as registrations,
         count(*) filter (where user_msgs > 0) as spoke,
         count(*) filter (where passes > 0) as bought_pass
  from rel where not is_admin group by 1 order by 1
)

select 'meta' as metric, to_jsonb(array_agg(x)) as value from meta x
union all select 'funnel_30d_raw_no_admin_excl', to_jsonb(array_agg(f)) from funnel_raw f
union all select 'funnel_30d_admin_excluded',    to_jsonb(array_agg(f)) from funnel_excl f
union all select 'consult_by_type',              to_jsonb(array_agg(c)) from consult_by_type c
union all select 'funnel_daily',                 to_jsonb(array_agg(d)) from daily d
union all select 'close_trigger_mix',            to_jsonb(array_agg(c)) from close_mix c
union all select 'close_trigger_prepost',        to_jsonb(array_agg(c)) from close_prepost c
union all select 'rel_cohort',                   to_jsonb(array_agg(r)) from rel_cohort r
union all select 'rel_free_turn_dist',           to_jsonb(array_agg(r)) from rel_turn_dist r
union all select 'rel_daily',                    to_jsonb(array_agg(r)) from rel_daily r;
