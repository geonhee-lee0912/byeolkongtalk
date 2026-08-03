-- 20260803000000_relationship_1n_slots.sql — 우리 사이 1:N 전환 + 관계 슬롯
-- 1) 유저당 1관계 강제하던 unique index 제거 → 다중 상대 허용
DROP INDEX IF EXISTS idx_relationships_user_one;
CREATE INDEX IF NOT EXISTS idx_relationships_user
  ON relationships(user_id, last_visited_at DESC);

-- 2) 관계 생성 원자 게이트 RPC — 슬롯 허용량(1 무료 + 구매 슬롯) 안에서만 insert.
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
  v_allowed := 1 + v_purchased;
  IF v_used >= v_allowed THEN
    RETURN json_build_object('success', false, 'reason', 'slot_required',
      'allowed', v_allowed, 'used', v_used);
  END IF;
  INSERT INTO relationships (user_id, label, status, self_profile_id, partner_profile_id)
    VALUES (p_user_id, p_label, p_status, p_self_profile_id, p_partner_profile_id)
    RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
END; $$;

-- 🔴 새 SECURITY DEFINER RPC — REVOKE 3종(PUBLIC·anon·authenticated) + 정확한 인자 시그니처.
REVOKE EXECUTE ON FUNCTION create_relationship(UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_relationship(UUID, TEXT, TEXT, UUID, UUID) TO service_role;
