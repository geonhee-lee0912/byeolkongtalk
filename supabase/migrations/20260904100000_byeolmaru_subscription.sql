-- 20260904100000_byeolmaru_subscription.sql — 별마루 구독(user-스코프 기간권) + 3일 체험 + 구매 RPC.
-- 스펙: docs/superpowers/specs/2026-09-04-별마루-2-구독게이트-design.md §5·§8
-- relationship_passes(relationship 스코프)는 재사용 불가 → 전용 테이블. star 인프라(star_balances·
-- star_transactions·purchase 원자 차감 패턴)는 purchase_relationship_pass(20260718010000) 그대로 미러.

-- 3일 체험: 1회성 시작 시각. NULL = 미사용. (users 확장 — ADD COLUMN IF NOT EXISTS 관례)
ALTER TABLE users ADD COLUMN IF NOT EXISTS byeolmaru_trial_started_at TIMESTAMPTZ;

-- 구독: user-스코프 기간권. 활성 = expires_at > now(). reward_granted_at 은 ②-b(출석 보상) 멱등용 예약.
CREATE TABLE IF NOT EXISTS byeolmaru_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  stars_spent INT NOT NULL,
  reward_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_byeolmaru_sub_active
  ON byeolmaru_subscriptions(user_id, expires_at DESC);

ALTER TABLE byeolmaru_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE byeolmaru_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE byeolmaru_subscriptions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE byeolmaru_subscriptions_id_seq TO service_role;

-- 구매: 원자 차감 + 활성 구독 있으면 만료 이어붙임. purchase_relationship_pass 미러(relationship_id 제거).
CREATE OR REPLACE FUNCTION purchase_byeolmaru_subscription(
  p_user_id UUID, p_cost INT, p_days INT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance INT; v_new_balance INT; v_current_expiry TIMESTAMPTZ; v_new_expiry TIMESTAMPTZ; v_sub_id BIGINT;
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

  SELECT MAX(expires_at) INTO v_current_expiry
    FROM byeolmaru_subscriptions WHERE user_id = p_user_id AND expires_at > now();
  v_new_expiry := COALESCE(GREATEST(v_current_expiry, now()), now()) + (p_days || ' days')::interval;

  v_new_balance := v_balance - p_cost;
  UPDATE star_balances SET balance = v_new_balance, total_spent = total_spent + p_cost, updated_at = now()
    WHERE user_id = p_user_id;
  INSERT INTO star_transactions (user_id, type, amount, balance_after, source)
    VALUES (p_user_id, 'spend', p_cost, v_new_balance, 'byeolmaru_subscription');
  INSERT INTO byeolmaru_subscriptions (user_id, expires_at, stars_spent)
    VALUES (p_user_id, v_new_expiry, p_cost) RETURNING id INTO v_sub_id;

  RETURN json_build_object('success', true, 'balance_after', v_new_balance,
    'subscription_id', v_sub_id, 'expires_at', v_new_expiry);
END; $$;
REVOKE EXECUTE ON FUNCTION purchase_byeolmaru_subscription(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purchase_byeolmaru_subscription(UUID, INT, INT) TO service_role;
