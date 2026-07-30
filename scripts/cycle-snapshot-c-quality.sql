-- 판정 사이클 스냅샷 C — 첫 풀이 분량 · [CARD:n] 마커 준수 · 회피 상용구 · 과잉 확언
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/cycle-snapshot-c-quality.sql
--
-- day 0 = 2026-07-26 (PROMPT_VERSION '2026-07-26-profitability-p1'). d4=7/30 · d7=8/2 · d14=8/9 · d28=8/23
--
-- ⚠️ length(content) 는 [CARD:n]·[END]·[RECO:] 마커를 포함한다. QA 하한(qa/evaluate/assertions.ts
--    FIRST_TURN_MIN_CHARS)은 마커 제거 후 길이라 직접 비교하면 SQL 쪽이 과대 → 여기서는 제거 후로 잰다.
-- ⚠️ "첫 풀이" = role='assistant' 중 created_at 최소. 대화 라우트가 created_at 을 ms 로 명시 지정하므로
--    (user=turnTs, assistant=turnTs+1ms) 순서가 결정적이다. 순번 컬럼은 없다.
-- ⚠️ 카드 수는 두 경로가 있다: drawn_cards 배열 길이(clarifier 추가분 **포함**) vs spread_type 상수.
--    첫 풀이 마커 준수는 **spread_type 기준**이 옳다(첫 풀이 시점엔 clarifier 카드가 없다).
-- ⚠️ 회피 상용구 정규식은 2026-07-25 분석에서 유의성이 확인된 것(z=2.68, p=0.007).
--    baseline: 1턴 16.2% · 2-3턴 9.2% · 4턴+ 5.1% (버킷 따라 단조 감소).
--    d0 의 P1 개입("시점질문 조건부범위 실효화")이 먹었으면 이 히트율이 내려간다.

with
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

meta as (
  select now() as run_at,
         ((now() at time zone 'UTC' + interval '9 hours')::date) as today_kst,
         (((now() at time zone 'UTC')::date) - date '2026-07-26') as cycle_day
),

r as (
  select r.id, r.user_id, r.consultation_type, r.spread_type, r.stars_spent,
         r.result_viewed_at, r.created_at, coalesce(r.prompt_version,'(none)') as pv,
         r.clarifier_count,
         left(r.user_id::text, 8) in (select p from ex) as is_admin,
         -- spread_type → 카드 수 (lib/tarot/spreads.ts SPREAD_INFO)
         case r.spread_type
           when 'one_card' then 1 when 'two_card' then 2 when 'three_card' then 3
           when 'relationship_5' then 5 when 'deep_feelings_5' then 5
           when 'reunion_5' then 5 when 'new_love_5' then 5
           when 'checkin_6' then 6 when 'stay_or_go_6' then 6
           when 'readiness_6' then 6 when 'healing_6' then 6
           when 'reunion_deep_7' then 7 when 'potential_7' then 7 when 'chakra_7' then 7
           else null end as spread_cards,
         coalesce(jsonb_array_length(case when jsonb_typeof(r.drawn_cards)='array' then r.drawn_cards end), 0) as drawn_cards,
         (select count(*) from messages m where m.reading_id = r.id and m.role='user') as user_turns
  from readings r
  where coalesce(r.emotion_tag,'') not like 'fortune:%'
    and r.consultation_type in ('saju','tarot')
    and r.skill_key is null
),
-- 첫 assistant 메시지
first_a as (
  select distinct on (m.reading_id) m.reading_id, m.content
  from messages m where m.role='assistant'
  order by m.reading_id, m.created_at asc, m.id asc
),
-- 마커 제거 후 순수 본문 길이 + 마커 수
fa as (
  select f.reading_id,
         length(regexp_replace(f.content, '\[(END|CARD:[0-9]+|RECO:[A-Za-z0-9_:]+)\]', '', 'g')) as chars_clean,
         length(f.content) as chars_raw,
         (length(f.content) - length(replace(f.content, '[CARD:', ''))) / 6 as marker_count,
         -- 3라벨 골격 (프리미엄 첫 풀이 강제)
         (f.content like '%🃏%') as has_card_label,
         (f.content like '%💫%') as has_situation_label,
         (f.content like '%🔗%') as has_flow_label
  from first_a f
),
j as (
  select r.*, fa.chars_clean, fa.chars_raw, fa.marker_count,
         fa.has_card_label, fa.has_situation_label, fa.has_flow_label,
         -- QA 하한 (FIRST_TURN_MIN_CHARS)
         case r.spread_cards when 1 then 400 when 2 then 400 when 3 then 1300
                             when 5 then 2300 when 6 then 2700 when 7 then 3300 else null end as min_chars
  from r join fa on fa.reading_id = r.id
  where not r.is_admin
),

-- ══ 1. 첫 풀이 분량 — 스프레드 카드 수 × 코호트 ══
len_by_cards as (
  select coalesce(spread_cards, -1) as cards, pv,
         count(*) as n,
         min_chars,
         round(percentile_cont(0.5) within group (order by chars_clean)::numeric) as med_clean,
         min(chars_clean) as min_clean, max(chars_clean) as max_clean,
         count(*) filter (where min_chars is not null and chars_clean >= min_chars) as meets_min,
         round(100.0 * count(*) filter (where min_chars is not null and chars_clean >= min_chars)
               / nullif(count(*) filter (where min_chars is not null),0), 1) as meets_min_pct
  from j where created_at >= now() - interval '30 days'
  group by 1,2,4 order by 1,2
),
-- 프리미엄(5장+)만 일별 (d0 전후 궤적)
len_premium_daily as (
  select ((created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         spread_cards as cards, count(*) as n,
         round(percentile_cont(0.5) within group (order by chars_clean)::numeric) as med_clean,
         min(chars_clean) as min_clean,
         count(*) filter (where chars_clean >= min_chars) as meets_min
  from j where spread_cards >= 5 and created_at >= now() - interval '21 days'
  group by 1,2 order by 1,2
),

-- ══ 2. [CARD:n] 마커 준수 (프리미엄 5장+) ══
marker as (
  select spread_cards as cards, pv, count(*) as n,
         count(*) filter (where marker_count = spread_cards) as marker_exact,
         count(*) filter (where marker_count = 0)            as marker_none,
         count(*) filter (where marker_count > 0 and marker_count < spread_cards) as marker_partial,
         count(*) filter (where marker_count > spread_cards) as marker_excess,
         count(*) filter (where has_card_label and has_situation_label and has_flow_label) as skeleton_ok
  from j
  where spread_cards >= 5 and created_at >= now() - interval '30 days'
  group by 1,2 order by 1,2
),
-- 전 스프레드 마커 (원카드 [CARD:1] 필수도 포함)
marker_all as (
  select coalesce(spread_cards,-1) as cards, count(*) as n,
         count(*) filter (where marker_count = spread_cards) as marker_exact,
         count(*) filter (where marker_count = 0) as marker_none
  from j where consultation_type='tarot' and created_at >= now() - interval '30 days'
  group by 1 order by 1
),

-- ══ 3. 회피 상용구 — 첫 풀이 · 유저 턴 버킷별 ══
-- 2026-07-25 실측 baseline: 1턴 16.2% / 2-3턴 9.2% / 4턴+ 5.1%
avoid as (
  select case when user_turns = 1 then '1_one_turn'
              when user_turns between 2 and 3 then '2_two_three'
              else '3_four_plus' end as turn_bucket,
         pv,
         count(*) as n,
         count(*) filter (where exists (
           select 1 from first_a f where f.reading_id = j.id
             and f.content ~ '(날짜를 (딱 )?찍어|콕 찍어|콕 집어|못 찍어|찍어주진 않|찍어주긴 어렵|찍어주는 카드는 아니)'
         )) as avoid_hits
  from j where created_at >= now() - interval '30 days'
  group by 1,2 order by 1,2
),
-- 첫 풀이 밖에서도 나오는지 — ⚠️ 모수는 **상담(사주·타로) 본체 메시지만**이다.
--    r CTE 가 skill_key is null + consultation_type in (saju,tarot) + 운세 배제라
--    관계 스레드·운세 리포트의 assistant 메시지는 안 들어간다. "서비스 전체"로 읽으면 과소평가.
avoid_all_msgs as (
  select case when m.created_at >= '2026-07-26T01:00:00Z' then 'post_d0' else 'pre_d0' end as cohort,
         count(*) as asst_msgs,
         count(*) filter (where m.content ~ '(날짜를 (딱 )?찍어|콕 찍어|콕 집어|못 찍어|찍어주진 않|찍어주긴 어렵|찍어주는 카드는 아니)') as avoid_hits,
         round(100.0 * count(*) filter (where m.content ~ '(날짜를 (딱 )?찍어|콕 찍어|콕 집어|못 찍어|찍어주진 않|찍어주긴 어렵|찍어주는 카드는 아니)')
               / nullif(count(*),0), 2) as avoid_pct
  from messages m join r on r.id = m.reading_id
  where m.role='assistant' and not r.is_admin and m.created_at >= '2026-07-19T01:00:00Z'
  group by 1 order by 1
),

-- ══ 4. 과잉 확언 — 🔴 이 지표는 2026-07-30(d4)에 **폐기 판정**됐다. 값을 믿지 말 것 ══
-- d4 에 표본 26건(확실* 25 + 딱N기간 1)을 전수 육안 검증했더니 **오탐 26/26 = 100%** 였다.
--   · "확실한 정보가 없어서" · "지금은 확실한 답이 보이는 시기가 아니라" → 오히려 **헤지**
--   · "아직 확실히 정해지지 않았다는 신호로 보이고" → 관찰 서술
--   · "이건 딱 4개월 차 연애의 특징" → '딱'이 강조 부사, 기간은 유저 발화 인용
-- 즉 어휘 매칭으로는 단정적 예언을 못 가른다 — 같은 단어가 확언과 완곡에 동시에 쓰인다.
-- 아래는 재현·대조용으로만 남긴다. **판정 근거로 인용 금지.** 화법 위반은 사람이 읽어야 한다
-- (LLM judge 도 같은 이유로 실패한 이력이 있다 — AGENTS.md 의 심문 피로 판정 경고).
assert_scan as (
  select case when m.created_at >= '2026-07-26T01:00:00Z' then 'post_d0' else 'pre_d0' end as cohort,
         count(*) as asst_msgs,
         count(*) filter (where m.content ~ '딱 [0-9]+ ?(주|일|달|개월|년|월)')  as ttl_pinned_period,
         count(*) filter (where m.content ~ '(반드시|틀림없|무조건)')            as absolute_words,
         count(*) filter (where m.content ~ '분명히')                           as clearly,
         count(*) filter (where m.content ~ '100%')                             as pct_100,
         count(*) filter (where m.content ~ '확실(해|히|할|한)')                 as certain,
         count(*) filter (where m.content ~ '(딱 [0-9]+ ?(주|일|달|개월|년|월)|반드시|틀림없|무조건|분명히|확실(해|히|할|한))') as any_hit,
         round(100.0 * count(*) filter (where m.content ~ '(딱 [0-9]+ ?(주|일|달|개월|년|월)|반드시|틀림없|무조건|분명히|확실(해|히|할|한))')
               / nullif(count(*),0), 2) as any_hit_pct
  from messages m join r on r.id = m.reading_id
  where m.role='assistant' and not r.is_admin and m.created_at >= '2026-07-19T01:00:00Z'
  group by 1 order by 1
),
-- 턴 위치별 (압박은 후반에 온다는 가설)
-- ⚠️ row_number() 를 창 필터보다 **먼저** 매긴다. 창을 서브쿼리 WHERE 에 걸면 d0 경계를 걸친
--    리딩의 post-d0 첫 메시지가 rn=1 로 오분류돼 '1_first' 가 부풀어진다.
assert_by_turn as (
  select case when rn = 1 then '1_first' when rn between 2 and 3 then '2_mid' else '3_late' end as turn_pos,
         count(*) as asst_msgs,
         count(*) filter (where content ~ '(딱 [0-9]+ ?(주|일|달|개월|년|월)|반드시|틀림없|무조건|분명히|확실(해|히|할|한))') as any_hit,
         round(100.0 * count(*) filter (where content ~ '(딱 [0-9]+ ?(주|일|달|개월|년|월)|반드시|틀림없|무조건|분명히|확실(해|히|할|한))')
               / nullif(count(*),0), 2) as any_hit_pct
  from (
    select m.content, m.created_at,
           row_number() over (partition by m.reading_id order by m.created_at, m.id) as rn
    from messages m join r on r.id = m.reading_id
    where m.role='assistant' and not r.is_admin
  ) z
  where z.created_at >= '2026-07-26T01:00:00Z'
  group by 1 order by 1
),
-- 표본 (문맥 확인용, 최근 12건)
assert_samples as (
  select left(m.reading_id::text, 8) as rid, r.spread_type,
         ((m.created_at at time zone 'UTC' + interval '9 hours')::date) as kst_date,
         substring(m.content from greatest(1, position('딱 ' in m.content) - 60) for 200) as excerpt
  from messages m join r on r.id = m.reading_id
  where m.role='assistant' and not r.is_admin
    and m.created_at >= '2026-07-26T01:00:00Z'
    and m.content ~ '딱 [0-9]+ ?(주|일|달|개월|년|월)'
  order by m.created_at desc limit 12
)

select 'meta' as metric, to_jsonb(array_agg(x)) as value from meta x
union all select 'len_by_cards',      to_jsonb(array_agg(l)) from len_by_cards l
union all select 'len_premium_daily', to_jsonb(array_agg(l)) from len_premium_daily l
union all select 'marker_premium',    to_jsonb(array_agg(m)) from marker m
union all select 'marker_all',        to_jsonb(array_agg(m)) from marker_all m
union all select 'avoid_first_reply', to_jsonb(array_agg(a)) from avoid a
union all select 'avoid_all_msgs',    to_jsonb(array_agg(a)) from avoid_all_msgs a
union all select 'assertive_scan',    to_jsonb(array_agg(a)) from assert_scan a
union all select 'assertive_by_turn', to_jsonb(array_agg(a)) from assert_by_turn a
union all select 'assertive_samples', to_jsonb(array_agg(a)) from assert_samples a;
