-- 20260718010000_relationship_pass_rpc.sql — 패스 구매(원자 차감 + 만료 이어붙임)
CREATE OR REPLACE FUNCTION purchase_relationship_pass(
  p_user_id UUID, p_relationship_id UUID, p_kind TEXT, p_cost INT, p_days INT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance INT; v_new_balance INT; v_current_expiry TIMESTAMPTZ; v_new_expiry TIMESTAMPTZ; v_pass_id UUID;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 OR p_days IS NULL OR p_days <= 0 THEN
    RETURN json_build_object('success', false, 'reason', 'invalid');
  END IF;

  SELECT balance INTO v_balance FROM star_balances WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO star_balances (user_id, balance, total_earned, total_spent) VALUES (p_user_id, 0, 0, 0);
    v_balance := 0;
  END IF;
  IF v_balance < p_cost THEN
    RETURN json_build_object('success', false, 'reason', 'insufficient', 'balance_after', v_balance);
  END IF;

  -- 활성 패스 있으면 그 만료에 이어붙임(결정: 시간 손실 방지)
  SELECT MAX(expires_at) INTO v_current_expiry
    FROM relationship_passes WHERE relationship_id = p_relationship_id AND expires_at > now();
  v_new_expiry := COALESCE(GREATEST(v_current_expiry, now()), now()) + (p_days || ' days')::interval;

  v_new_balance := v_balance - p_cost;
  UPDATE star_balances SET balance = v_new_balance, total_spent = total_spent + p_cost, updated_at = now()
    WHERE user_id = p_user_id;
  INSERT INTO star_transactions (user_id, type, amount, balance_after, source)
    VALUES (p_user_id, 'spend', p_cost, v_new_balance, 'relationship_pass');
  INSERT INTO relationship_passes (user_id, relationship_id, kind, stars_spent, expires_at)
    VALUES (p_user_id, p_relationship_id, p_kind, p_cost, v_new_expiry) RETURNING id INTO v_pass_id;

  RETURN json_build_object('success', true, 'balance_after', v_new_balance,
    'pass_id', v_pass_id, 'expires_at', v_new_expiry);
END; $$;
REVOKE EXECUTE ON FUNCTION purchase_relationship_pass FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purchase_relationship_pass TO service_role;
