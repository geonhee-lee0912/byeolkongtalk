-- 보유 기간 만료 파기에 1년 기한 넷을 더한다 (운영자 결정 애플-4-3A, 2026-11-22).
-- 함수를 통째로 바꾼다 — 앞 정의(20261122000000)의 다섯 문장·안전장치는 글자 그대로다.
--   · 방문 기록(page_views): 행은 남기고 회원·익명 식별자와 유입 주소를 비운다. 별자리 초대로 온 행은 utm_content 가 공유 ID 라 같이 비운다
--   · 화면 이용 기록(ui_events): 행은 남기고 회원·익명 식별자와 상담 연결(reading_id)을 비운다. meta 에 든 별자리 공유 ID 도 뺀다
--   · 설문 응답(survey_responses): 행을 지운다 — 1인 1회는 app/api/survey 가 보상 원장으로도 본다
--   · 오류 기록(error_logs): 행을 지운다(3개월 IP·브라우저 정보 비우기는 그대로)
--
-- 🔴 되돌릴 수 없다. p_execute = true 일 때만 바꾸고, 그 밖(인자 없음·false·NULL)은 세기만 한다.
-- 🔴 방문·이용 기록에 개인을 가리키는 칸이나 meta 키를 새로 넣으면 여기도 고친다.
-- 🔴 해시 공식의 정본은 lib/auth/identity-hash.ts — 로그인 수단을 늘리면 여기도 고친다(20261122000000 머리말).
--
-- 1년이 지난 기간의 대가: 사람 수(UV)·재방문을 다시 셀 수 없고, 회원 연결이 없어 어드민 제외 필터도 안 먹는다.
-- 롤백: 20261122000000_purge_expired_records.sql 의 함수 정의를 다시 실행(이미 지운 것은 돌아오지 않는다)

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
    'error_logs', v_old_logs
  );
end;
$$;

revoke execute on function public.purge_expired_records(boolean) from public, anon, authenticated;
grant execute on function public.purge_expired_records(boolean) to service_role;
