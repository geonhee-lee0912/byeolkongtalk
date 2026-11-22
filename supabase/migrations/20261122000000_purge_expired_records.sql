-- 보유 기간이 지난 개인정보 파기 (운영자 결정 애플-4-1A, 2026-11-22). 개인정보처리방침 제4조·제5조의2 6호의 기간 그대로.
--   · 탈퇴 뒤 1년: 탈퇴 기록(해시·유입 정보)은 withdrawn_at 기준, 혜택 수령 기록은 아래 조건
--   · 위기 감지 기록 1년
--   · 접속 로그 3개월: 오류 기록은 남기고 IP·브라우저 정보만 비운다
--
-- 🔴 되돌릴 수 없다. p_execute = true 일 때만 지우고, 그 밖(인자 없음·false·NULL)은 세기만 한다.
--    부르는 쪽(예약 작업)은 따로 올린다 — 이 파일만으로는 아무것도 안 지워진다.
--
-- 혜택 수령 기록(bonus_claims)엔 탈퇴 시각이 없다. 셋을 다 만족할 때만 지운다:
--   ① 같은 해시의 현재 회원이 없다 ② 1년 안의 탈퇴 기록이 없다 ③ 받은 지 1년이 지났다
--   → 지워진 뒤 재가입하면 웰컴·첫 충전 혜택을 다시 받는다(방침대로).
--   → 탈퇴 기록 저장이 실패한 탈퇴자는 ③만으로 판정된다.
-- 🔴 해시 공식의 정본은 lib/auth/identity-hash.ts — 로그인 수단을 늘리면 여기도 고친다.
--    그 전까지는 모르는 수단이 보이면 통째로 멈춘다(못 알아본 회원의 원장을 지우지 않게).
--
-- SECURITY DEFINER 가 아니다 — service_role 이 표 권한(20261021000000)으로 돈다.
-- 롤백: drop function public.purge_expired_records(boolean); (이미 지운 것은 돌아오지 않는다)

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
  v_logs bigint;
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

  return jsonb_build_object(
    'executed', v_execute,
    'withdrawals', v_withdrawals,
    'bonus_claims', v_claims,
    'sensitive_alerts', v_alerts,
    'log_ip_ua', v_logs
  );
end;
$$;

revoke execute on function public.purge_expired_records(boolean) from public, anon, authenticated;
grant execute on function public.purge_expired_records(boolean) to service_role;
