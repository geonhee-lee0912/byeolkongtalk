-- 앱 푸시 알림 뼈대 표 5개 (앱 알림 단계 1).
--
-- 표는 전부 service_role 로만 접근한다. anon·authenticated 에는 권한을 주지 않는다.
-- 같은 마이그레이션에서 RLS 를 켜고 service_role GRANT 를 직접 쓴다
-- (AGENTS.md 코딩 규칙 'DB 권한 기본값', 2026-10-30 이후 자동 권한 중단 대비).
--
-- 롤백: 표 5개 drop. 데이터 손실이 없는 건 이 표를 쓰는 코드(브랜치 claude/app-push)가 올라가기 전까지뿐이다 —
-- 그 뒤엔 기기 등록·예약·발송 기록(중복 발송 방어 포함)이 사라진다.

create table public.push_devices (
  token text primary key,                       -- Expo 푸시 토큰
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz                         -- Expo 가 '등록 안 된 기기'라고 하면 채운다
);
-- 부분 인덱스(where disabled_at is null)로 두지 않는다 — 회원 탈퇴 CASCADE(delete ... where user_id = $1)가 못 쓴다
create index push_devices_user_idx on public.push_devices(user_id);

create table public.push_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  revisit boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.push_asks (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  moment text not null check (moment in ('first_reading_end','second_launch','reading_end','byeolmaru_first','birthday')),
  answer text not null check (answer in ('accepted','later','os_denied')),
  created_at timestamptz not null default now()
);
create index push_asks_user_idx on public.push_asks(user_id);

create table public.push_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('revisit')),
  reading_id uuid not null references public.readings(id) on delete cascade,
  send_on date not null,                          -- KST 날짜
  status text not null default 'pending' check (status in ('pending','sent','skipped')),
  created_at timestamptz not null default now(),
  unique (reading_id, kind)
);
create index push_schedules_due_idx on public.push_schedules(send_on) where status = 'pending';
create index push_schedules_user_idx on public.push_schedules(user_id);  -- 회원 탈퇴 CASCADE

create table public.push_sends (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  class text not null check (class in ('info','ad')),
  ref_id text not null,                           -- 다시 볼 날은 schedule id
  send_date date not null,                        -- KST
  device_count int not null default 0,
  expo_tickets jsonb not null default '[]',       -- [{ "id": 티켓, "token": 기기 }]
  sent_at timestamptz not null default now(),
  receipt_checked_at timestamptz,
  opened_at timestamptz,
  unique (user_id, kind, ref_id, send_date)
);
-- cron 이 15분마다 영수증을 아직 확인 안 한 발송만 읽는다(order by id limit 500)
create index push_sends_receipt_pending_idx on public.push_sends(id) where receipt_checked_at is null;

alter table public.push_devices enable row level security;
alter table public.push_preferences enable row level security;
alter table public.push_asks enable row level security;
alter table public.push_schedules enable row level security;
alter table public.push_sends enable row level security;

grant select, insert, update, delete on public.push_devices to service_role;
grant select, insert, update, delete on public.push_preferences to service_role;
grant select, insert, update, delete on public.push_asks to service_role;
grant select, insert, update, delete on public.push_schedules to service_role;
grant select, insert, update, delete on public.push_sends to service_role;

grant usage, select, update on sequence public.push_asks_id_seq to service_role;
grant usage, select, update on sequence public.push_sends_id_seq to service_role;
