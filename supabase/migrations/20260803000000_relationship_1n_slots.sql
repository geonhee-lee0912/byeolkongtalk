-- 20260803000000_relationship_1n_slots.sql — 우리 사이 1:N 전환 + 관계 슬롯
-- 1) 유저당 1관계 강제하던 unique index 제거 → 다중 상대 허용
DROP INDEX IF EXISTS idx_relationships_user_one;
CREATE INDEX IF NOT EXISTS idx_relationships_user
  ON relationships(user_id, last_visited_at DESC);

-- 2) 슬롯 구매 RPC — 별 원자 차감 + 기록(source='relationship_slot').
--    관계 생성은 하지 않는다(허용량만 늘림, 생성은 POST /api/relationship).
CREATE OR REPLACE FUNCTION purchase_relationship_slot(
  p_user_id UUID, p_cost INT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance INT; v_new_balance INT;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN json_build_object('success', false, 'reason', 'invalid');
  END IF;
  SELECT balance INTO v_balance FROM star_balances WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO star_balances (user_id, balance, total_earned, total_spent)
      VALUES (p_user_id, 0, 0, 0);
    v_balance := 0;
  END IF;
  IF v_balance < p_cost THEN
    RETURN json_build_object('success', false, 'reason', 'insufficient', 'balance_after', v_balance);
  END IF;
  v_new_balance := v_balance - p_cost;
  UPDATE star_balances SET balance = v_new_balance, total_spent = total_spent + p_cost, updated_at = now()
    WHERE user_id = p_user_id;
  INSERT INTO star_transactions (user_id, type, amount, balance_after, source)
    VALUES (p_user_id, 'spend', p_cost, v_new_balance, 'relationship_slot');
  RETURN json_build_object('success', true, 'balance_after', v_new_balance);
END; $$;

-- 🔴 새 SECURITY DEFINER RPC — REVOKE 3종(PUBLIC·anon·authenticated) 필수.
--    함수별 정확한 인자로 지정(PostgREST 인자 불일치는 404, 회수 먹으면 401).
REVOKE EXECUTE ON FUNCTION purchase_relationship_slot(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purchase_relationship_slot(UUID, INT) TO service_role;
