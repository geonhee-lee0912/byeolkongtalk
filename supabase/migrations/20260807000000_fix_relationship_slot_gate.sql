-- 20260807000000_fix_relationship_slot_gate.sql — create_relationship 슬롯 게이트 정책 동기화
-- 배경: 2026-08-05(2511d08) "무료 첫 사람 폐지" 결정으로 lib/relationship/types.ts 의
--       slotAllowance() 가 Math.max(0, purchased) (허용 = 구매 슬롯 수) 로 바뀌었으나, 관계 생성
--       서버 게이트인 create_relationship RPC 는 20260803000000 의 옛 공식 v_allowed := 1 + v_purchased
--       (첫 사람 무료) 그대로 남아 drift 발생. POST /api/relationship 은 app 측 slotAllowance 사전
--       검사 없이 이 RPC 를 유일한 서버 게이트로 호출하므로, 서버가 항상 정책보다 정확히 1개
--       (구매 0이면 첫 관계)를 무료 허용하는 상태였다.
--       → 허용량을 slotAllowance 와 동일하게 v_allowed := v_purchased 로 맞춘다(첫 사람부터 결제).
-- 데이터: RPC 는 신규 insert 만 게이트한다. dev 에서 옛 공식으로 이미 만든 무료 첫 관계 행은
--         삭제하지 않는다(해당 유저는 used>=allowed 가 되어 다음 등록만 결제 요구 — 정책상 정상).
--         prod 는 1:N 슬롯 미배포라 기존 행 없음.
-- 관계 생성 원자 게이트 RPC — 슬롯 허용량(= 구매 슬롯 수) 안에서만 insert.
--    count→insert 사이 race 를 per-user advisory lock 으로 직렬화(동시 요청이 게이트를 함께
--    통과해 허용량을 넘기는 것을 차단). 슬롯 구매 자체는 lib/stars 의 spend_stars 로 처리한다.
CREATE OR REPLACE FUNCTION create_relationship(
  p_user_id UUID, p_label TEXT, p_status TEXT,
  p_self_profile_id UUID, p_partner_profile_id UUID
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_purchased INT; v_used INT; v_allowed INT; v_id UUID;
BEGIN
  -- per-user 직렬화: 같은 유저의 동시 관계 생성만 줄 세운다(다른 유저는 자유).
  PERFORM pg_advisory_xact_lock(hashtext('rel_create:' || p_user_id::text)::bigint);
  SELECT count(*) INTO v_purchased FROM star_transactions
    WHERE user_id = p_user_id AND source = 'relationship_slot';
  SELECT count(*) INTO v_used FROM relationships WHERE user_id = p_user_id;
  v_allowed := v_purchased;  -- 첫 사람부터 결제(무료 첫 사람 폐지). lib/relationship slotAllowance 와 정합.
  IF v_used >= v_allowed THEN
    RETURN json_build_object('success', false, 'reason', 'slot_required',
      'allowed', v_allowed, 'used', v_used);
  END IF;
  INSERT INTO relationships (user_id, label, status, self_profile_id, partner_profile_id)
    VALUES (p_user_id, p_label, p_status, p_self_profile_id, p_partner_profile_id)
    RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
END; $$;

-- 🔴 SECURITY DEFINER RPC — CREATE OR REPLACE 는 기존 ACL 을 보존하지만, AGENTS.md 이중방어
--    규칙대로 REVOKE 3종(PUBLIC·anon·authenticated) + service_role GRANT 를 재선언(멱등).
REVOKE EXECUTE ON FUNCTION create_relationship(UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_relationship(UUID, TEXT, TEXT, UUID, UUID) TO service_role;
