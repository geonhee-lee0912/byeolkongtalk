-- charge_stars 멱등성 강화: payment_id 를 유니크 인덱스로 보장
-- 기존 idx_star_tx_payment 는 plain index 라 SELECT-then-INSERT 레이스에서
-- 동시 중복 지급(웰컴 별 더블 그랜트 등)이 가능했다. 유니크 제약 + RPC 예외
-- 처리로 DB 레벨에서 1회 지급을 보장한다.

-- 혹시 이미 생긴 중복 row 정리 (가장 오래된 것만 남김) — 신규 서비스라 보통 0건
DELETE FROM star_transactions a
 USING star_transactions b
 WHERE a.payment_id IS NOT NULL
   AND a.payment_id = b.payment_id
   AND a.type = 'charge' AND b.type = 'charge'
   -- created_at 동률(같은 트랜잭션 등)이면 id 로 타이브레이크 — 한 행은 반드시 남긴다
   AND (a.created_at > b.created_at
        OR (a.created_at = b.created_at AND a.id > b.id));

DROP INDEX IF EXISTS idx_star_tx_payment;
CREATE UNIQUE INDEX IF NOT EXISTS idx_star_tx_payment
  ON star_transactions(payment_id) WHERE payment_id IS NOT NULL;

-- ─── charge_stars (교체) ────────────────────────────────────────
-- 기존 SELECT-then-INSERT 멱등 체크에 unique_violation EXCEPTION 핸들러 추가.
-- 동시 호출에서 두 번째 INSERT 가 unique_violation 을 발생시키면,
-- 핸들러가 이미 저장된 row 를 SELECT 해 멱등 응답을 반환한다.
-- CREATE OR REPLACE 는 기존 GRANT 를 보존하므로 별도 GRANT 불필요.
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
  v_existing_balance INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'reason', 'invalid_amount', 'balance_after', 0);
  END IF;

  -- 멱등성 패스트패스: 같은 payment_id 로 이미 충전 기록 있으면 그대로 반환
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

  BEGIN
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

  EXCEPTION WHEN unique_violation THEN
    -- 동시 중복 INSERT 가 유니크 인덱스를 위반한 경우:
    -- 이 블록의 변경사항은 자동 롤백됨. 먼저 저장된 row 를 찾아 멱등 응답 반환.
    SELECT st.id, sb.balance
      INTO v_existing_tx, v_existing_balance
      FROM star_transactions st
      LEFT JOIN star_balances sb ON sb.user_id = p_user_id
     WHERE st.payment_id = p_payment_id
       AND st.type = 'charge'
     LIMIT 1;

    RETURN json_build_object(
      'success', true,
      'idempotent', true,
      'balance_after', COALESCE(v_existing_balance, 0),
      'transaction_id', v_existing_tx
    );
  END;

  RETURN json_build_object(
    'success', true,
    'balance_after', v_new_balance,
    'transaction_id', v_existing_tx
  );
END;
$$;
