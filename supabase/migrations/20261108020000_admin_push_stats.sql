-- 앱 알림 성과 어드민 — 집계 RPC 5개(원본 행을 앱으로 끌어오지 않는다, AGENTS.md '어드민 집계').
-- 설계 docs/superpowers/specs/2026-11-06-앱-알림-design.md §1 '잴 것': 알림 허용률·광고 동의율(묻는 순간별),
-- 다시 볼 날 설정·그날 돌아온 비율, 알림 종류별 열람률·수신거부율.
-- 화면: app/admin/push (라우트 app/api/admin/push 가 부른다). 전부 service_role 전용.
-- SECURITY INVOKER — service_role 이 표 권한으로 읽는다(권한 상승 없음). p_exclude 가 NULL 이어도
-- `<> all(NULL)` 이 NULL 이 되어 전부 0 으로 나오지 않게 coalesce 한다(NULL 3값 함정).
-- 날짜 버킷은 KST — (x at time zone 'UTC' + interval '9 hours')::date.
-- 롤백: 함수 5개 drop(데이터 영향 없음).

-- ① 지금 상태 — 기기·동의·칸
create or replace function public.admin_push_summary(p_exclude uuid[])
returns table (
  device_users bigint, devices bigint, ad_granted bigint, ad_withdrawn bigint,
  revisit_off bigint, morning_off bigint, opened_app_7d bigint
)
language sql stable security invoker set search_path = public as $$
  select
    (select count(distinct d.user_id) from push_devices d where d.disabled_at is null and d.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))),
    (select count(*) from push_devices d where d.disabled_at is null and d.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))),
    (select count(*) from ad_consents c where c.status = 'granted' and c.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))),
    (select count(*) from ad_consents c where c.status = 'withdrawn' and c.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))),
    (select count(*) from push_preferences p where p.revisit = false and p.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))),
    (select count(*) from push_preferences p where p.morning = false and p.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))),
    (select count(*) from push_app_opens o where o.last_open_at >= now() - interval '7 days' and o.user_id <> all(coalesce(p_exclude, '{}'::uuid[])));
$$;

-- ② 묻는 순간별 답 — 알림 허용률(accepted / 전체), 다시 묻기 효과
create or replace function public.admin_push_asks(p_since timestamptz, p_exclude uuid[])
returns table (moment text, kind text, answer text, cnt bigint, users bigint)
language sql stable security invoker set search_path = public as $$
  select a.moment, a.kind, a.answer, count(*)::bigint, count(distinct a.user_id)::bigint
  from push_asks a
  where a.created_at >= p_since and a.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))
  group by a.moment, a.kind, a.answer
  order by 1, 2, 3;
$$;

-- ③ 광고 동의·철회·통지 — 순간(source)별
create or replace function public.admin_push_consent(p_since timestamptz, p_exclude uuid[])
returns table (event text, source text, cnt bigint, users bigint)
language sql stable security invoker set search_path = public as $$
  select e.event, e.source, count(*)::bigint, count(distinct e.user_id)::bigint
  from ad_consent_events e
  where e.created_at >= p_since and e.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))
  group by e.event, e.source
  order by 1, 2;
$$;

-- ④ 보낸 알림 — KST 날짜 × 종류 × 정보성/광고. 열람(누르고 연 것)·수신거부
--    보냄 = 한 기기 이상에 나간 발송(device_count > 0). 진행 중이거나 보내기 전에 멈춘 선점 행(device_count 0)은 빼고,
--    열람·수신거부도 보낸 것 안에서만 센다. claimed 는 선점 전체(차이가 크면 발송이 멈춘 것)
create or replace function public.admin_push_sends_daily(p_since timestamptz, p_exclude uuid[])
returns table (day date, kind text, klass text, sent bigint, claimed bigint, opened bigint, unsubscribed bigint)
language sql stable security invoker set search_path = public as $$
  select
    (s.sent_at at time zone 'UTC' + interval '9 hours')::date,
    s.kind,
    s.class,
    count(*) filter (where s.device_count > 0)::bigint,
    count(*)::bigint,
    count(*) filter (where s.device_count > 0 and s.opened_at is not null)::bigint,
    count(*) filter (where s.device_count > 0 and s.unsubscribed_at is not null)::bigint
  from push_sends s
  where s.sent_at >= p_since and s.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

-- ⑤ 다시 볼 날 — 예약 상태(창 안에서 만든 예약). 고른 간격은 세지 않는다 — 날짜를 바꾸면 send_on 만 갱신되고
--    created_at 은 그대로라 간격을 거꾸로 계산할 수 없다(Codex 리뷰 #36)
create or replace function public.admin_push_revisit(p_since timestamptz, p_exclude uuid[])
returns table (status text, cnt bigint, users bigint)
language sql stable security invoker set search_path = public as $$
  select s.status, count(*)::bigint, count(distinct s.user_id)::bigint
  from push_schedules s
  where s.created_at >= p_since and s.user_id <> all(coalesce(p_exclude, '{}'::uuid[]))
  group by s.status
  order by 1;
$$;

-- 날짜 창으로 읽는 발송 기록 — 행이 회원 × 알림 × 날로 늘어난다
create index push_sends_sent_at_idx on public.push_sends(sent_at);

revoke all on function public.admin_push_summary(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_push_asks(timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.admin_push_consent(timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.admin_push_sends_daily(timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.admin_push_revisit(timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_push_summary(uuid[]) to service_role;
grant execute on function public.admin_push_asks(timestamptz, uuid[]) to service_role;
grant execute on function public.admin_push_consent(timestamptz, uuid[]) to service_role;
grant execute on function public.admin_push_sends_daily(timestamptz, uuid[]) to service_role;
grant execute on function public.admin_push_revisit(timestamptz, uuid[]) to service_role;
