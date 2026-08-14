-- 20260814000000_relationship_free_first_slot.sql — 첫 사람 무료(등록벽 제거) 슬롯 게이트 복원
-- 배경: 2026-08-14 사용자 결정으로 "첫 슬롯 무료" 채택(과거 14/15 무발화의 등록 유료벽 제거).
--       lib/relationship/types.ts 의 slotAllowance() 를 1 + max(0, purchased) 로 복원(무료 슬롯 1).
--       서버 게이트 create_relationship RPC 도 동일하게 v_allowed := 1 + v_purchased 로 맞춘다.
--       (20260807000000 의 v_purchased = "무료 첫 사람 폐지" 를 이 마이그레이션이 되돌린다.)
-- 데이터: RPC 는 신규 insert 만 게이트한다. 기존 행은 손대지 않는다.
--         prod 는 1:N 슬롯(20260803000000) 미배포라, main 머지 시 803→807→814 순으로 적용돼
--         최종 상태가 곧바로 올바른 값(1 + v_purchased)이 된다.
-- 관계 생성 원자 게이트 RPC — 슬롯 허용량(= 무료 1 + 구매 슬롯) 안에서만 insert.
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
  v_allowed := 1 + v_purchased;  -- 첫 사람 무료 + 구매 슬롯. lib/relationship slotAllowance 와 정합.
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
