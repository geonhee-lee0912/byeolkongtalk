-- 20260604000000_stars.sql — Phase 4 (c) 별 재화 시스템
-- v1 (tarot-friend) 의 star_balances/star_transactions + spend_stars/charge_stars RPC 이식.
--
-- Phase 4 (c) 시점 적용:
--   - star_transactions.reading_id 컬럼만 있고 FK 는 미적용 (readings 테이블 없음)
--     → Phase 5 readings 도입 시 ALTER 로 FK 추가
--   - star_transactions.payment_id 는 TEXT nullable 로 두고 payments 테이블 FK 도 Phase 3 PG 결정 후

CREATE TABLE IF NOT EXISTS star_balances (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned INT NOT NULL DEFAULT 0,
  total_spent INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS star_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('charge','spend','bonus','refund')),
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  source VARCHAR(50) NOT NULL,
  payment_id VARCHAR(100),
  reading_id UUID, -- Phase 5 에서 readings(id) FK 추가
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_star_tx_user
  ON star_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_star_tx_payment
  ON star_transactions(payment_id) WHERE payment_id IS NOT NULL;

-- RLS: service_role 만 RW (클라는 /api/stars/* 경유)
ALTER TABLE star_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE star_transactions ENABLE ROW LEVEL SECURITY;

-- ─── spend_stars ───────────────────────────────────────────────
-- 별 차감 + transaction 기록. SELECT FOR UPDATE 로 row lock → 동시 차감 직렬화.
-- p_reading_id 는 Phase 4 (c) 시점엔 NULL 허용 (Phase 5 에서 사주 풀이마다 reading_id 매칭).
CREATE OR REPLACE FUNCTION spend_stars(
  p_user_id UUID,
  p_amount INT,
  p_reading_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'reading'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INT;
  v_new_balance INT;
  v_tx_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'reason', 'invalid_amount', 'balance_after', 0);
  END IF;

  SELECT balance INTO v_balance
    FROM star_balances
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO star_balances (user_id, balance, total_earned, total_spent)
      VALUES (p_user_id, 0, 0, 0);
    v_balance := 0;
  END IF;

  IF v_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'reason', 'insufficient',
      'balance_after', v_balance
    );
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE star_balances
     SET balance = v_new_balance,
         total_spent = total_spent + p_amount,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO star_transactions (
    user_id, type, amount, balance_after, source, reading_id
  )
  VALUES (
    p_user_id, 'spend', p_amount, v_new_balance, p_source, p_reading_id
  )
  RETURNING id INTO v_tx_id;

  RETURN json_build_object(
    'success', true,
    'balance_after', v_new_balance,
    'transaction_id', v_tx_id
  );
END;
$$;

-- ─── charge_stars ──────────────────────────────────────────────
-- 결제 승인 후 별 충전. 같은 payment_id 가 이미 충전되면 멱등 응답.
-- Phase 3 PG 결정 후 결제 콜백에서 호출.
CREATE OR REPLACE FUNCTION charge_stars(
  p_user_id UUID,
  p_amount INT,
  p_payment_id TEXT,
  p_source TEXT DEFAULT 'kakaopay'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INT;
  v_new_balance INT;
  v_existing_tx UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'reason', 'invalid_amount', 'balance_after', 0);
  END IF;

  -- 멱등성: 같은 payment_id 로 이미 충전 기록 있으면 그대로 반환
  SELECT id INTO v_existing_tx
    FROM star_transactions
   WHERE payment_id = p_payment_id
     AND type = 'charge'
   LIMIT 1;

  IF v_existing_tx IS NOT NULL THEN
    SELECT balance INTO v_balance
      FROM star_balances
     WHERE user_id = p_user_id;
    RETURN json_build_object(
      'success', true,
      'idempotent', true,
      'balance_after', COALESCE(v_balance, 0),
      'transaction_id', v_existing_tx
    );
  END IF;

  SELECT balance INTO v_balance
    FROM star_balances
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO star_balances (user_id, balance, total_earned, total_spent)
      VALUES (p_user_id, 0, 0, 0);
    v_balance := 0;
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE star_balances
     SET balance = v_new_balance,
         total_earned = total_earned + p_amount,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO star_transactions (
    user_id, type, amount, balance_after, source, payment_id
  )
  VALUES (
    p_user_id, 'charge', p_amount, v_new_balance, p_source, p_payment_id
  )
  RETURNING id INTO v_existing_tx;

  RETURN json_build_object(
    'success', true,
    'balance_after', v_new_balance,
    'transaction_id', v_existing_tx
  );
END;
$$;

-- 권한: service_role 만 EXECUTE
REVOKE EXECUTE ON FUNCTION spend_stars FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION charge_stars FROM PUBLIC;
GRANT EXECUTE ON FUNCTION spend_stars TO service_role;
GRANT EXECUTE ON FUNCTION charge_stars TO service_role;
