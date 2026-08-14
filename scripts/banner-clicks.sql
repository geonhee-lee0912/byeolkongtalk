-- 홈 히어로 캐러셀 배너 클릭 집계 — 슬롯별 클릭 수 + 순 방문자
-- 사용: SUPABASE_PAT=<값> node scripts/run-prod-query.mjs scripts/banner-clicks.sql
--
-- 배경: 캐러셀 클릭은 HeroCarousel 이 ui_events 에 banner_clicked{slot:<카드 id>} 로 기록한다
--   (2026-08-14 교체 — 과거 ?b=<id>(page_views)는 쿼리를 저장하지 않아 DB 에 도달하지 못했다).
-- ⚠️ ui_events 는 어드민 화면/RPC 가 없다(exit_chip 계열도 동일) — 판독은 이 raw SQL 로 한다.
-- ⚠️ 지인 제외 목록(analytics-exclusion-list)은 anon 귀속 클릭이라 user_id 매칭이 얕다 —
--    표본이 커지면 제외 조인을 붙일 것. 지금은 원시 집계.
-- 파라미터: 아래 interval 을 바꿔 창을 조절(기본 30일).

select
  meta ->> 'slot'                as slot,
  count(*)                       as clicks,
  count(distinct anon_id)        as uv,
  count(*) filter (where user_id is not null) as clicks_member,
  min(created_at)                as first_click,
  max(created_at)                as last_click
from ui_events
where event = 'banner_clicked'
  and created_at >= now() - interval '30 days'
group by 1
order by clicks desc;
