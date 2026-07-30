-- scripts/admin-expected-values.sql
-- 어드민 집계 RPC 전환의 정답지. Postgres 직결(Management API)이라 Supabase `Max rows` cap 무관.
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/admin-expected-values.sql
--
-- 어드민 제외 미적용 — 스펙 §6-5 고정점(628/400/320)과 같은 조건을 유지한다.
-- 🆕 2026-07-31: 날짜 기준을 **KST 자정**으로 통일했다(이전 오전 10시 롤오버).
--    버킷식: ((created_at at time zone 'UTC' + interval '9 hours')::date)
--    ⚠️ `at time zone 'UTC'` 를 반드시 넣는다 — 빼면 timestamptz::date 캐스트가 **세션 TimeZone
--       에 좌우된다**. 이전 판은 이게 없어서 "Management API 세션이 UTC 라 우연히 맞는" 상태였다.
--       RPC(20260731000000)·JS(lib/admin-time.ts kstDate)와 이 세 곳이 같아야 대조가 성립한다.
-- 🆕 방문자 구성은 RPC 와 같이 **세션 시작 귀속**(30분 갭)이다. 페이지뷰 귀속으로 재면 화면과
--    하루 1명 수준으로 어긋나 정답지가 거짓 불일치를 만든다.

with
-- ── 0. 실행 시각 · 오늘 버킷 (정답지가 어느 시점 것인지 문서에 박기 위해) ──
meta as (
  select now() as run_at,
         ((now() at time zone 'UTC' + interval '9 hours')::date) as today_bucket
),
-- ── 1. page_views 일별 PV/UV (KST 자정, 페이지뷰 귀속) ──
-- UV 가 페이지뷰 귀속인 것은 의도된 것 — PV 가 정의상 페이지뷰 수라 짝을 맞춘다.
trend as (
  select ((created_at at time zone 'UTC' + interval '9 hours')::date) as bucket,
         count(*) as pv,
         count(distinct anon_id) as uv
  from page_views
  where is_bot = false
  group by 1
),
-- ── 2. 방문자 구성 (신규/연속/복귀) — 세션 시작 귀속. prev 는 창 무관 = 전체 테이블 lag ──
-- SESSION_GAP 30분: 실측 세션 평균 4.2분 · p90 13.1분 (n=325). RPC 주석과 같은 근거.
ev as (
  select anon_id, created_at,
         case when lag(created_at) over w is null
                or created_at - lag(created_at) over w > interval '30 minutes'
              then 1 else 0 end as newsess
  from page_views
  where anon_id is not null and is_bot = false
  window w as (partition by anon_id order by created_at)
),
sess as (
  select anon_id, created_at,
         sum(newsess) over (partition by anon_id order by created_at) as sno
  from ev
),
visits as (
  select distinct anon_id,
         ((min(created_at) at time zone 'UTC' + interval '9 hours')::date) as bucket
  from sess group by anon_id, sno
),
lagged as (
  select anon_id, bucket,
         lag(bucket) over (partition by anon_id order by bucket) as prev
  from visits
),
mix as (
  select bucket,
         count(*) as uv,
         count(*) filter (where prev is null) as new_uv,
         count(*) filter (where prev = bucket - 1) as streak_uv,
         count(*) filter (where prev < bucket - 1) as back_uv
  from lagged group by 1
),
-- ── 3. 봇 비율 (봇 포함 분모) ──
bot as (
  select count(*) as total_pv, count(*) filter (where is_bot) as bot_pv from page_views
),
-- ── 4. 라우트별 (PV 상위 20) ──
routes as (
  select path, count(distinct anon_id) as uv, count(*) as pv
  from page_views where is_bot = false
  group by 1 order by count(*) desc, count(distinct anon_id) desc limit 20
),
-- ── 5. 로그인 전/후 ──
auth as (
  select case when user_id is null then 'guest' else 'member' end as segment,
         count(distinct anon_id) as uv, count(*) as pv
  from page_views where is_bot = false group by 1
),
-- ── 6. 상담 퍼널 고정점 (스펙 §6-5: 628/400/320 이 2026-07-28 기준값) ──
-- 날짜 버킷을 쓰지 않으므로 **자정 전환이 이 값을 바꾸지 않는다** = 전환의 회귀 감지점.
-- ⚠️ 단 `now() - 30 days` 상대창이라 시간이 지나면 자연 증가한다(2026-07-31 실측 663/422/340).
--    "고정점"은 특정 시점 값이지 불변수가 아니다 — 전환 전후를 **같은 시점에** 비교할 것.
consult as (
  select r.id, r.result_viewed_at
  from readings r
  where r.created_at >= (now() - interval '30 days')
    and (r.emotion_tag is null or r.emotion_tag not like 'fortune:%')
),
funnel as (
  select count(*) as started,
         count(*) filter (where exists (
           select 1 from messages m
           where m.reading_id = c.id and m.role = 'assistant' and m.content like '%[END]%'
         )) as ended,
         count(*) filter (where c.result_viewed_at is not null and exists (
           select 1 from messages m
           where m.reading_id = c.id and m.role = 'assistant' and m.content like '%[END]%'
         )) as viewed
  from consult c
),

-- ══════════ 플랜 B 지표 (/admin/analytics 4라우트) ══════════
-- 🆕 2026-07-31 추가. 이 라우트들도 KST 자정이라 위 traffic 지표와 **같은 기준**이다
--    (2026-07-29 플랜 B 초안은 "traffic 은 10시라 다르다"고 적었지만 통일로 그 주의가 소멸했다).
-- ⚠️ 이 테이블들은 user_id 가 NOT NULL 이라 page_views 의 3값 논리 문제가 없다.
--    정답지는 어드민 제외 미적용 유지 → p_exclude = '{}' 로 호출한 RPC 와 대조된다.

-- ── 7. analytics 트렌드 (가입 · 리딩 · 매출) ──
atrend as (
  select bucket, sum(nu) as new_users, sum(rd) as readings, sum(rev) as revenue_won
  from (
    select ((created_at at time zone 'UTC' + interval '9 hours')::date) as bucket, 1 as nu, 0 as rd, 0 as rev
      from users where created_at >= (now() - interval '30 days')
    union all
    select ((created_at at time zone 'UTC' + interval '9 hours')::date), 0, 1, 0
      from readings where created_at >= (now() - interval '30 days')
    union all
    select ((created_at at time zone 'UTC' + interval '9 hours')::date), 0, 0, coalesce(amount_won, 0)
      from payments where status = 'completed' and created_at >= (now() - interval '30 days')
  ) t group by 1
),

-- ── 8. 상품 분해 — 상담(사주/타로) ──
-- 🔴 운세 판정은 `like 'fortune:%'` 만으로 하면 안 된다 — 앱의 fortuneTypeFromTag 는 접미사가
--    **FORTUNE_CONFIG 의 유효 키일 때만** 운세로 본다. 'fortune:오타' 는 앱이 상담으로 분류한다.
--    단순 prefix 필터를 쓰면 SQL 이 그걸 운세로 빼내 조용히 어긋난다 → 유효 키 검사까지 재현한다.
-- ⚠️ 유효 키 배열은 인라인이다. CTE 로 빼서 `= any((select keys from …))` 로 쓰면 Postgres 가
--    ANY(subquery) 형태로 파싱해 `text = text[]` 로 죽는다(배열 형태 ANY 가 아니게 된다).
areadings as (
  select r.consultation_type, r.emotion_tag, coalesce(r.stars_spent,0) as stars_spent,
         case when r.emotion_tag like 'fortune:%'
               and substring(r.emotion_tag from 9) = any(array[
                   'daily','monthly','saju_full','tarot_daily','tarot_love','tarot_money',
                   'tarot_career','tarot_relation','compat','compat_social','good_days'])
              then substring(r.emotion_tag from 9) end as fortune_kind
  from readings r
  where r.created_at >= (now() - interval '30 days')
    and r.consultation_type <> 'relationship'
),
acounsel as (
  select consultation_type, coalesce(emotion_tag, '(없음)') as emotion_tag,
         count(*) as cnt, count(*) filter (where stars_spent > 0) as paid_cnt,
         sum(stars_spent) as stars
  from areadings where fortune_kind is null
  group by 1,2
),
afortune as (
  select fortune_kind, count(*) as cnt,
         count(*) filter (where stars_spent > 0) as paid_cnt, sum(stars_spent) as stars
  from areadings where fortune_kind is not null group by 1
),
-- 진단: 'fortune:' 인데 유효 키가 아닌 태그 (있으면 위 두 갈래 분류의 경계 사례)
afortune_invalid as (
  select emotion_tag, count(*) as cnt
  from areadings
  where emotion_tag like 'fortune:%' and fortune_kind is null
  group by 1
),

-- ── 9. 코호트 크기 (KST 월요일 = date_trunc('week')) ──
acohort as (
  select date_trunc('week', created_at at time zone 'UTC' + interval '9 hours')::date as week_start,
         count(*) as cohort_size
  from users where created_at >= (now() - interval '84 days')
  group by 1
),

-- ── 10. 퍼널 (소재별 가입) — 별칭 병합 미적용 상태의 원본 키 ──
-- RPC 는 admin_canonical_creative 로 별칭을 병합하므로 '새 판매 광고 - 사본' 행이 'tarot' 로
-- 합쳐지는 차이만 나야 한다. 그 외 차이는 버그다.
afunnel as (
  select coalesce(nullif(a.utm_content, ''), '(organic)') as creative,
         count(distinct a.user_id) as signups
  from user_acquisition a
  where a.created_at >= (now() - interval '30 days')
  group by 1
)

select 'meta' as metric, to_jsonb(array_agg(x)) as value from meta x
union all select 'trend',  to_jsonb(array_agg(t)) from (select * from trend order by bucket) t
union all select 'visitor_mix', to_jsonb(array_agg(m)) from (select * from mix order by bucket) m
union all select 'bot',         to_jsonb(array_agg(b)) from bot b
union all select 'routes',      to_jsonb(array_agg(r)) from routes r
union all select 'auth',        to_jsonb(array_agg(a)) from (select * from auth order by segment) a
union all select 'consult_funnel', to_jsonb(array_agg(f)) from funnel f
-- ── 플랜 B 지표 ──
union all select 'analytics_trend',  to_jsonb(array_agg(t)) from (select * from atrend order by bucket) t
union all select 'product_counsel',  to_jsonb(array_agg(c)) from (select * from acounsel order by cnt desc) c
union all select 'product_fortune',  to_jsonb(array_agg(f)) from (select * from afortune order by cnt desc) f
union all select 'fortune_invalid_tags (빈 배열이 정상)', to_jsonb(array_agg(i)) from afortune_invalid i
union all select 'cohort_sizes',     to_jsonb(array_agg(h)) from (select * from acohort order by week_start desc) h
union all select 'funnel_signups',   to_jsonb(array_agg(f)) from (select * from afunnel order by signups desc) f;
