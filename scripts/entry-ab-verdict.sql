-- 입구 반반(A/B) 판정 — 방문자 단위 행(부트스트랩 입력). 스펙 2026-10-11-타로-로그인전-맛보기 §7
-- 🔴 창 끝 + 48시간 뒤에만 실행(엿보기 금지). 창 중엔 entry-ab-daily-check.sql(고장 감시)만 돌린다.
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/entry-ab-verdict.sql > <스크래치패드>/entry-verdict.json
--       node scripts/ab-bootstrap.mjs <스크래치패드>/entry-verdict.json --a new --b old --metric signed_up --metric rev48
-- ▶ params: start_at = ENTRY_AB='split' prod 배포 시각(KST) · win = 14일(1주 연장 판정이면 21일, 최대 28일)
-- 대상: 창 안에 첫 PV 가 생긴 익명 방문자 · 첫 PV utm_source='meta' · 첫 PV 비로그인 · 봇 제외 · 나중에 지인 6명으로 이어지는 anon 제외
-- signed_up = 첫 방문 후 48시간 안에 그 anon_id 로 로그인한 계정이 그 사이에 '새로' 만들어졌다(1/0)
-- rev48     = 그 anon_id 로 첫 방문 후 48시간 안에 로그인한 계정(새로 가입했든 기존 회원이든)이 그 48시간 안에 낸 결제 합(원) — 로그인하지 않았으면 0
-- 결정 규칙(스펙 §7): signed_up 차이 95% 구간이 0 위 + rev48 차이 95% 구간이 0 아래가 아님 → 전원 새 흐름 / signed_up 0 아래 또는 rev48 0 아래 → 옛 흐름 / 걸침 → 1주 연장(최대 3주)

with
params as (select null::timestamptz as start_at, interval '14 days' as win),   -- ▶ 예: timestamptz '2026-10-26 21:00:00+09'
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),

first_pv as (
  select distinct on (pv.anon_id) pv.anon_id, pv.created_at as first_at, pv.utm_source, pv.user_id as first_uid
  from page_views pv
  where pv.anon_id is not null and not pv.is_bot
  order by pv.anon_id, pv.created_at
),
visitors as (
  select f.anon_id, f.first_at,
         case when position(lower(right(f.anon_id, 1)) in '02468ace') > 0 then 'new' else 'old' end as arm
  from first_pv f, params
  where params.start_at is not null
    and f.first_at >= params.start_at and f.first_at < params.start_at + params.win
    and f.utm_source = 'meta' and f.first_uid is null
),
linked as (
  select distinct on (pv.anon_id) pv.anon_id, pv.user_id
  from page_views pv join visitors v on v.anon_id = pv.anon_id
  where pv.user_id is not null
    and pv.created_at >= v.first_at and pv.created_at < v.first_at + interval '48 hours'
  order by pv.anon_id, pv.created_at
),
scored as (
  select v.anon_id, v.arm, l.user_id,
         (u.created_at is not null and u.created_at >= v.first_at
           and u.created_at < v.first_at + interval '48 hours')::int as signed_up,
         coalesce((select sum(p.amount_won) from payments p
                    where l.user_id is not null and p.user_id = l.user_id and p.status = 'completed'
                      and p.created_at >= v.first_at and p.created_at < v.first_at + interval '48 hours'), 0) as rev48
  from visitors v
  left join linked l on l.anon_id = v.anon_id
  left join users u on u.id = l.user_id
)
select arm, signed_up, rev48
from scored
where user_id is null or left(user_id::text, 8) not in (select p from ex)
order by arm;
