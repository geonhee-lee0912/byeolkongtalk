-- 앱 알림 단계 2 — 광고성 정보 수신 동의 장치.
-- 설계: docs/superpowers/specs/2026-11-06-앱-알림-design.md §4·§6-5 / 계획: docs/superpowers/plans/2026-11-08-앱-알림-2-광고동의.md
--
-- 표는 전부 service_role 로만 접근한다. anon·authenticated 에는 권한을 주지 않는다.
-- 같은 마이그레이션에서 RLS 를 켜고 service_role GRANT 를 직접 쓴다(AGENTS.md 'DB 권한 기본값').
--
-- 롤백: 함수 2개·표 2개 drop, push_asks.kind·push_sends.unsubscribed_at drop.
-- 이 표를 쓰는 코드가 올라간 뒤 롤백하면 동의·철회 기록(법정 보관 대상)이 사라진다 — 그 뒤엔 롤백하지 말 것.

-- ① 회원별 앱 푸시 광고 동의 상태. 행이 없으면 '미동의'(철회와 구분 — 미동의엔 결과 통지가 없다)
create table public.ad_consents (
  user_id uuid primary key references public.users(id) on delete cascade,
  status text not null check (status in ('granted','withdrawn')),
  first_granted_at timestamptz not null,          -- 최초 동의 — 2년 재확인의 기산점. 철회·재동의로 바뀌지 않는다
  granted_at timestamptz not null,                -- 가장 최근 동의
  withdrawn_at timestamptz,                       -- 가장 최근 철회
  last_reconfirm_notice_at timestamptz,           -- 마지막 2년 재확인 통지
  updated_at timestamptz not null default now()
);
-- 2년 재확인 대상 찾기(cron) — 동의 중인 회원만
create index ad_consents_granted_idx on public.ad_consents(first_granted_at) where status = 'granted';

-- ② 동의·철회·결과 통지·재확인 통지 기록과 그때의 순간
create table public.ad_consent_events (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  event text not null check (event in ('grant','withdraw','result_notice','reconfirm_notice')),
  source text not null check (source in (
    'first_reading_end','second_launch','reading_end','byeolmaru_first','birthday',
    'settings','unsubscribe_button','unsubscribe_line','reconfirm_popup','reconfirm_push'
  )),
  created_at timestamptz not null default now()
);
create index ad_consent_events_user_idx on public.ad_consent_events(user_id);  -- 회원 탈퇴 CASCADE

-- ③ 다시 묻기 상한을 거절 종류별로 센다 — 'push'(알림 켜기) / 'ad'(광고 동의만)
alter table public.push_asks add column kind text not null default 'push' check (kind in ('push','ad'));

-- ④ 수신거부 표(알림마다 1장)의 1회용 표시
alter table public.push_sends add column unsubscribed_at timestamptz;

alter table public.ad_consents enable row level security;
alter table public.ad_consent_events enable row level security;

grant select, insert, update, delete on public.ad_consents to service_role;
grant select, insert, update, delete on public.ad_consent_events to service_role;
grant usage, select, update on sequence public.ad_consent_events_id_seq to service_role;

-- ⑤ 동의·철회 + 결과 통지 기록 + (수신거부 표면) 표 사용 표시를 한 트랜잭션으로.
--    p_send_id(수신거부 표)는 철회에만 쓴다. 그 회원의 '광고' 발송이고 아직 안 쓴 표일 때만 진행한다.
--    거절 이유: token_invalid(없는 발송·남의 발송·정보성 발송) / token_used(이미 쓴 표).
--    돌려주는 값: { ok, reason?, changed, status, at }
--    SECURITY INVOKER — service_role 이 표 권한으로 부른다(권한 상승 없음).
create or replace function public.push_set_ad_consent(
  p_user_id uuid,
  p_grant boolean,
  p_source text,
  p_send_id bigint default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_status text;
  v_changed boolean := false;
begin
  -- 상태가 안 바뀌는 호출에서도 잘못된 source 를 바로 드러낸다(이벤트 CHECK 는 바뀔 때만 걸린다)
  if p_source is null or p_source not in (
    'first_reading_end','second_launch','reading_end','byeolmaru_first','birthday',
    'settings','unsubscribe_button','unsubscribe_line','reconfirm_popup'
  ) then
    raise exception 'push_set_ad_consent: bad source %', p_source;
  end if;
  if p_send_id is not null and p_grant then
    raise exception 'push_set_ad_consent: unsubscribe token cannot grant';
  end if;

  -- 같은 회원의 동의·철회를 줄 세운다 — 행이 아직 없는 첫 동의는 FOR UPDATE 로 잠글 행이 없어,
  -- 동시에 두 번 들어오면 둘 다 '바뀜'으로 이벤트·통지가 두 번 남았다
  perform pg_advisory_xact_lock(hashtextextended('push_set_ad_consent:' || p_user_id::text, 0));

  if p_send_id is not null then
    update public.push_sends
       set unsubscribed_at = v_now
     where id = p_send_id
       and user_id = p_user_id
       and class = 'ad'
       and unsubscribed_at is null;
    if not found then
      if exists (select 1 from public.push_sends where id = p_send_id and user_id = p_user_id and class = 'ad') then
        return jsonb_build_object('ok', false, 'reason', 'token_used');
      end if;
      return jsonb_build_object('ok', false, 'reason', 'token_invalid');
    end if;
  end if;

  select status into v_status from public.ad_consents where user_id = p_user_id;

  if p_grant then
    if v_status is distinct from 'granted' then
      insert into public.ad_consents (user_id, status, first_granted_at, granted_at, updated_at)
      values (p_user_id, 'granted', v_now, v_now, v_now)
      on conflict (user_id) do update
        set status = 'granted', granted_at = v_now, updated_at = v_now;
      v_status := 'granted';
      v_changed := true;
    end if;
  else
    if v_status = 'granted' then
      update public.ad_consents
         set status = 'withdrawn', withdrawn_at = v_now, updated_at = v_now
       where user_id = p_user_id;
      v_status := 'withdrawn';
      v_changed := true;
    end if;
  end if;

  if v_changed then
    insert into public.ad_consent_events (user_id, event, source)
    values (p_user_id, case when p_grant then 'grant' else 'withdraw' end, p_source),
           (p_user_id, 'result_notice', p_source);
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'status', coalesce(v_status, 'none'),
    'at', v_now
  );
end;
$$;

-- ⑥ 2년 재확인 통지 기록 — 동의 중일 때만 남긴다. 남겼으면 true
create or replace function public.push_record_reconfirm_notice(
  p_user_id uuid,
  p_source text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.ad_consents
     set last_reconfirm_notice_at = now(), updated_at = now()
   where user_id = p_user_id and status = 'granted';
  if not found then
    return false;
  end if;
  insert into public.ad_consent_events (user_id, event, source) values (p_user_id, 'reconfirm_notice', p_source);
  return true;
end;
$$;

revoke all on function public.push_set_ad_consent(uuid, boolean, text, bigint) from public, anon, authenticated;
revoke all on function public.push_record_reconfirm_notice(uuid, text) from public, anon, authenticated;
grant execute on function public.push_set_ad_consent(uuid, boolean, text, bigint) to service_role;
grant execute on function public.push_record_reconfirm_notice(uuid, text) to service_role;
