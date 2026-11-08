-- 앱 알림 단계 3 — 오늘의 별 흐름(아침 알림).
-- 설계: docs/superpowers/specs/2026-11-06-앱-알림-design.md §3 B·C, §4-6, §5-3 / 계획: docs/superpowers/plans/2026-11-08-앱-알림-3-오늘의별흐름.md
--
-- 표는 service_role 로만 접근한다. anon·authenticated 에는 권한을 주지 않는다(같은 마이그레이션에 RLS + GRANT 직접).
-- 롤백: push_app_opens drop, push_preferences.morning drop. 데이터 손실은 '앱을 연 시각'(14일 멈춤 판정)과 아침 칸 설정뿐.

-- ① 알림 설정의 '아침 별 흐름' 칸(§4-6). 구독자는 정보성, 비구독자는 이 칸과 광고 동의가 둘 다 켜져야 받는다
alter table public.push_preferences add column morning boolean not null default true;

-- ② 회원이 앱을 마지막으로 연 시각 — 아침 알림을 받는데 14일 동안 앱을 열지 않으면 멈추고, 다시 열면 재개한다(§5-3).
--    단계 4 의 7·14일 미접속 깨우기도 이 값을 쓴다
create table public.push_app_opens (
  user_id uuid primary key references public.users(id) on delete cascade,
  last_open_at timestamptz not null default now()
);

alter table public.push_app_opens enable row level security;
grant select, insert, update, delete on public.push_app_opens to service_role;
