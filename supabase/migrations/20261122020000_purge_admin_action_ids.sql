-- 탈퇴한 회원이 남은 관리자 작업 기록을 비운다 (운영자 결정 애플-14A, 2026-11-22).
-- admin_actions 는 대상 회원에 FK 가 없어 탈퇴해도 남는다. 행·날짜·종류·수량은 남기고 아래 칸만 비운다.
--   · 대상이 회원인 기록(target_type = 'user' — 별 조정·무료 지급): target_id(회원 id)와 사유
--   · 개인 팝업 보냄(popup_send): payload 의 targetUserId 와 제목
--   · 개인 팝업 회수(popup_revoke): 제목 — 회원 id 가 없어 같은 팝업의 보낸 기록으로 잇는다(못 이으면 비운다)
--   환불 사유(payment_refund)는 5년 보관하는 결제 기록에 딸린 것이라 그대로 둔다.
-- 기한이 아니라 "그 회원이 없다"가 조건이다 — 매일 도는 cron 이라 탈퇴 뒤 최대 하루.
-- 함수를 통째로 바꾼다 — 앞 정의(20261122010000)의 아홉 문장·안전장치는 글자 그대로다.
--
-- 🔴 되돌릴 수 없다. p_execute = true 일 때만 바꾸고, 그 밖(인자 없음·false·NULL)은 세기만 한다.
-- 🔴 방문·이용 기록에 개인을 가리키는 칸이나 meta 키를, 관리자 작업 기록의 payload 에 회원을 가리키는 키를 새로 넣으면 여기도 고친다.
-- 🔴 해시 공식의 정본은 lib/auth/identity-hash.ts — 로그인 수단을 늘리면 여기도 고친다(20261122000000 머리말).
-- 롤백: 20261122010000_purge_usage_records.sql 의 함수 정의를 다시 실행(이미 비운 것은 돌아오지 않는다)

create or replace function public.purge_expired_records(p_execute boolean default false)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_execute boolean := coalesce(p_execute, false);
  v_year_ago timestamptz := now() - interval '1 year';
  v_quarter_ago timestamptz := now() - interval '3 months';
  v_withdrawals bigint;
  v_claims bigint;
  v_alerts bigint;
  v_notes bigint;
  v_logs bigint;
  v_page_views bigint;
  v_ui_events bigint;
  v_surveys bigint;
  v_old_logs bigint;
  v_admin_actions bigint;
begin
  if exists (select 1 from public.user_identities where provider not in ('kakao', 'apple')) then
    raise exception 'purge_expired_records: unknown login provider';
  end if;

  -- 각 문장은 '대상'을 한 번만 정하고 v_execute 일 때만 그 대상을 바꾼다(세는 것과 지우는 것이 어긋나지 않게)
  with members as (
    select encode(sha256(convert_to(
             case i.provider when 'apple' then 'apple:' || i.provider_user_id else i.provider_user_id end,
             'UTF8')), 'hex') as hash
    from public.user_identities i
    union
    -- 로그인 수단 행이 없는 옛 카카오 회원(lib/auth/user-identity.ts 의 보충 경로와 같은 이유)
    select encode(sha256(convert_to(u.kakao_id::text, 'UTF8')), 'hex')
    from public.users u
    where u.kakao_id is not null
  ), expired as (
    select c.kakao_id_hash, c.bonus_type
    from public.bonus_claims c
    where c.claimed_at < v_year_ago
      and not exists (select 1 from members m where m.hash = c.kakao_id_hash)
      and not exists (
        select 1 from public.account_withdrawals w
        where w.kakao_id_hash = c.kakao_id_hash and w.withdrawn_at >= v_year_ago
      )
  ), purged as (
    delete from public.bonus_claims c
    using expired e
    where v_execute and c.kakao_id_hash = e.kakao_id_hash and c.bonus_type = e.bonus_type
    returning 1
  )
  select count(*) into v_claims from expired;

  with expired as (
    select w.id from public.account_withdrawals w where w.withdrawn_at < v_year_ago
  ), purged as (
    delete from public.account_withdrawals w using expired e where v_execute and w.id = e.id
    returning 1
  )
  select count(*) into v_withdrawals from expired;

  with expired as (
    select s.id from public.sensitive_alerts s where s.created_at < v_year_ago
  ), purged as (
    delete from public.sensitive_alerts s using expired e where v_execute and s.id = e.id
    returning 1
  )
  select count(*) into v_alerts from expired;

  -- 검토 라우트가 메모를 작업 기록에도 복사한다. 1년 안의 알림에 딸린 것만 남긴다(이미 없는 알림의 사본도 비운다)
  with expired as (
    select a.id from public.admin_actions a
    where a.action = 'sensitive_review'
      and coalesce(a.payload ->> 'note', '') <> ''
      and not exists (
        select 1 from public.sensitive_alerts s
        where s.id::text = a.target_id and s.created_at >= v_year_ago
      )
  ), purged as (
    update public.admin_actions a set payload = a.payload - 'note'
    from expired e
    where v_execute and a.id = e.id
    returning 1
  )
  select count(*) into v_notes from expired;

  with expired as (
    select l.id from public.error_logs l
    where l.created_at < v_quarter_ago and (l.ip is not null or l.user_agent is not null)
  ), purged as (
    update public.error_logs l set ip = null, user_agent = null
    from expired e
    where v_execute and l.id = e.id
    returning 1
  )
  select count(*) into v_logs from expired;

  -- 아래 넷이 애플-4-3A
  with expired as (
    select p.id from public.page_views p
    where p.created_at < v_year_ago
      and (
        p.user_id is not null or p.anon_id is not null or p.referrer is not null
        or (p.utm_source = 'byeoljari' and p.utm_content is not null)
      )
  ), purged as (
    update public.page_views p set
      user_id = null,
      anon_id = null,
      referrer = null,
      utm_content = case when p.utm_source = 'byeoljari' then null else p.utm_content end
    from expired e
    where v_execute and p.id = e.id
    returning 1
  )
  select count(*) into v_page_views from expired;

  -- meta 는 객체일 때만 손댄다(문자열 "shareId" 에도 ? 가 참이고, 객체가 아니면 키 빼기가 오류다)
  with expired as (
    select u.id from public.ui_events u
    where u.created_at < v_year_ago
      and (
        u.user_id is not null or u.anon_id is not null or u.reading_id is not null
        or (
          jsonb_typeof(u.meta) = 'object'
          and (u.meta ? 'shareId' or u.meta ->> 'next' like '/fortune/byeoljari/%')
        )
      )
  ), purged as (
    update public.ui_events u set
      user_id = null,
      anon_id = null,
      reading_id = null,
      meta = case
        when jsonb_typeof(u.meta) = 'object' and u.meta ->> 'next' like '/fortune/byeoljari/%' then u.meta - 'shareId' - 'next'
        when jsonb_typeof(u.meta) = 'object' then u.meta - 'shareId'
        else u.meta
      end
    from expired e
    where v_execute and u.id = e.id
    returning 1
  )
  select count(*) into v_ui_events from expired;

  with expired as (
    select r.id from public.survey_responses r where r.created_at < v_year_ago
  ), purged as (
    delete from public.survey_responses r using expired e where v_execute and r.id = e.id
    returning 1
  )
  select count(*) into v_surveys from expired;

  -- 접속 로그 비우기 뒤에 둔다 — 세기만 할 때와 지울 때의 log_ip_ua 가 같게
  with expired as (
    select l.id from public.error_logs l where l.created_at < v_year_ago
  ), purged as (
    delete from public.error_logs l using expired e where v_execute and l.id = e.id
    returning 1
  )
  select count(*) into v_old_logs from expired;

  -- 애플-14A. 적힌 id 는 주소에서 온 글자라 대소문자를 맞춰 비교한다(현재 회원 것을 비우지 않게)
  with expired as (
    select a.id from public.admin_actions a
    where (
        a.target_type = 'user' and a.target_id is not null
        and not exists (select 1 from public.users u where u.id::text = lower(a.target_id))
      ) or (
        a.action = 'popup_send' and a.payload ->> 'targetUserId' is not null
        and not exists (select 1 from public.users u where u.id::text = lower(a.payload ->> 'targetUserId'))
      ) or (
        a.action = 'popup_revoke' and a.payload ->> 'broadcast' = 'false' and a.payload ? 'title'
        and not exists (
          select 1 from public.admin_actions s
          join public.users u on u.id::text = lower(s.payload ->> 'targetUserId')
          where s.action = 'popup_send' and lower(s.target_id) = lower(a.target_id)
        )
      )
  ), purged as (
    update public.admin_actions a set
      target_id = case when a.target_type = 'user' then null else a.target_id end,
      payload = case when a.target_type = 'user' then a.payload - 'reason' else a.payload - 'targetUserId' - 'title' end
    from expired e
    where v_execute and a.id = e.id
    returning 1
  )
  select count(*) into v_admin_actions from expired;

  return jsonb_build_object(
    'executed', v_execute,
    'withdrawals', v_withdrawals,
    'bonus_claims', v_claims,
    'sensitive_alerts', v_alerts,
    'review_notes', v_notes,
    'log_ip_ua', v_logs,
    'page_view_ids', v_page_views,
    'ui_event_ids', v_ui_events,
    'survey_responses', v_surveys,
    'error_logs', v_old_logs,
    'admin_action_ids', v_admin_actions
  );
end;
$$;

revoke execute on function public.purge_expired_records(boolean) from public, anon, authenticated;
grant execute on function public.purge_expired_records(boolean) to service_role;
