-- 타로톡 메뉴판 반반(A/B) 판정 — 가입자 단위 행(부트스트랩 입력). 스펙 docs/superpowers/specs/2026-10-05-타로톡-메뉴판-별경제-design.md §9
-- 🔴 공식 판정은 창 끝 + 48시간(2026-10-25 21:29:15 KST) 뒤에 전원으로. 그 전에는 mature = 1(가입 48시간 경과)만 골라 미리보기로만 쓴다.
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/menu-ab-verdict.sql > <스크래치패드>/menu-verdict.json
--       node scripts/ab-bootstrap.mjs <그 파일> --a menu --b legacy --metric rev48 --metric paid48
-- 그룹: user_id 끝 글자 짝수(0 2 4 6 8 a c e) = menu, 홀수 = legacy — lib/tarot/menu-ab.ts 와 같은 규칙
-- 모집단: 창(배포 시각부터 14일) 안에 가입한 사람 전원(광고·오가닉 무관) · 지인 6명 제외 · 탈퇴한 사람은 users 에 없어 빠진다(두 그룹 공통)
-- rev48 = 가입 후 48시간 안 완료 결제 합(원) · paid48 = rev48 > 0 · is_meta = 유입 utm_source 'meta'(보조 분석용)
-- 결정 규칙(§9): rev48 차이 95% 구간이 0 위 → 전원 메뉴판 / 0 아래 → 전원 옛 타로톡 / 걸침 → 1주 연장(최대 3주, 그래도 걸치면 평균 높은 쪽)

with
params as (select timestamptz '2026-10-09 21:29:15+09' as start_at, interval '14 days' as win),   -- #3 prod 배포(4d3eed86) = 판정 창 시작
ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) as p),
u as (
  select us.id as user_id, us.created_at as signup_at,
         case when position(right(us.id::text, 1) in '02468ace') > 0 then 'menu' else 'legacy' end as arm,
         exists (select 1 from user_acquisition a where a.user_id = us.id and a.utm_source = 'meta') as is_meta
  from users us, params
  where us.created_at >= params.start_at and us.created_at < params.start_at + params.win
    and left(us.id::text, 8) not in (select p from ex)
),
scored as (
  select u.arm, u.is_meta, u.signup_at,
         (select coalesce(sum(p.amount_won), 0) from payments p
           where p.user_id = u.user_id and p.status = 'completed'
             and p.created_at >= u.signup_at and p.created_at < u.signup_at + interval '48 hours') as rev48
  from u
)
select arm,
       rev48,
       (rev48 > 0)::int as paid48,
       is_meta::int as is_meta,
       (signup_at + interval '48 hours' <= now())::int as mature
from scored
order by arm, rev48 desc;
