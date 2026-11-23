-- 20261124000000_iap_clawback.sql — 앱 결제(애플·구글 인앱) 환불 회수 + 스토어 매출 집계
--
-- 앱에서 스토어(애플·구글)로 결제한 별은, 스토어가 환불하면 이미 쓴 별까지 되돌릴 수 없다.
-- 그래서 환불 시 "남아 있는 만큼만" 회수하고 못 거둔 만큼(shortfall)은 기록으로 남긴다.
--   1) payments 칸 4개 — 보너스 별·환불 시각·회수한 별·못 거둔 별
--   2) clawback_stars — 환불 회수 RPC. 같은 p_payment_id 로 다시 불러도 한 번만 거둔다(멱등)
--   3) admin_store_revenue — 스토어(apple/google)별 매출·환불·미회수 집계 (어드민 후속 화면용)
--
-- ⚠️ 이 마이그레이션을 읽는 코드(결제 라우트·환불 처리·어드민)는 별도 PR 로 올린다.
--    표·함수가 먼저 생겨야 하므로 이 파일만 먼저 push → Supabase 체크 success 확인 → 코드.

-- ─── 1) payments 칸 ─────────────────────────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bonus_stars INT NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stars_clawed_back INT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS clawback_shortfall INT;

-- ─── 2) clawback_stars ──────────────────────────────────────────
-- 환불로 별을 회수한다. 잔액이 모자라면 있는 만큼만 거두고 나머지는 shortfall 로 반환.
-- 거둔 양이 0 이어도 'refund' 거래 행을 남긴다 — 그 행이 멱등 기준(payment_id UNIQUE)이다.
-- amount 는 spend_stars 와 같이 양수로 저장, total_spent 에 합산한다.
-- 멱등 확인은 star_balances 행 잠금(FOR UPDATE) 뒤에 한다 — 같은 환불 두 건이 직렬화되어
-- 두 번째가 첫 번째 행을 본다. 잔액 행이 없어 잠금이 없는 경우의 동시 INSERT 는
-- unique_violation 핸들러가 기존 행으로 멱등 응답한다(charge_stars 와 같은 방식).
CREATE OR REPLACE FUNCTION clawback_stars(
  p_user_id UUID,
  p_amount INT,
  p_payment_id TEXT,
  p_source TEXT DEFAULT 'iap_refund'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INT;
  v_has_balance BOOLEAN := false;
  v_clawed INT;
  v_new_balance INT;
  v_existing_amount INT;
  v_existing_balance INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'reason', 'invalid_amount',
      'clawed', 0, 'shortfall', 0, 'balance_after', 0, 'idempotent', false
    );
  END IF;

  BEGIN
    SELECT balance INTO v_balance
      FROM star_balances
     WHERE user_id = p_user_id
     FOR UPDATE;
    v_has_balance := FOUND;

    -- 멱등: 잠금 뒤에 확인 (같은 환불의 동시 호출은 여기서 직렬화됨)
    SELECT amount INTO v_existing_amount
      FROM star_transactions
     WHERE payment_id = p_payment_id
       AND type = 'refund'
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'clawed', v_existing_amount,
        'shortfall', greatest(p_amount - v_existing_amount, 0),
        'balance_after', coalesce(v_balance, 0),
        'idempotent', true
      );
    END IF;

    IF v_has_balance THEN
      v_clawed := least(v_balance, p_amount);
      v_new_balance := v_balance - v_clawed;

      UPDATE star_balances
         SET balance = v_new_balance,
             total_spent = total_spent + v_clawed,
             updated_at = now()
       WHERE user_id = p_user_id;
    ELSE
      -- 잔액 행이 없으면 만들지 않는다. 거둔 것 0, 전액 shortfall
      v_clawed := 0;
      v_new_balance := 0;
    END IF;

    INSERT INTO star_transactions (
      user_id, type, amount, balance_after, source, payment_id
    )
    VALUES (
      p_user_id, 'refund', v_clawed, v_new_balance, p_source, p_payment_id
    );

  EXCEPTION WHEN unique_violation THEN
    -- 동시 중복 INSERT: 이 블록 변경은 롤백됨. 먼저 저장된 행으로 멱등 응답
    SELECT st.amount, sb.balance
      INTO v_existing_amount, v_existing_balance
      FROM star_transactions st
      LEFT JOIN star_balances sb ON sb.user_id = p_user_id
     WHERE st.payment_id = p_payment_id
       AND st.type = 'refund'
     LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'clawed', coalesce(v_existing_amount, 0),
      'shortfall', greatest(p_amount - coalesce(v_existing_amount, 0), 0),
      'balance_after', coalesce(v_existing_balance, 0),
      'idempotent', true
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'clawed', v_clawed,
    'shortfall', p_amount - v_clawed,
    'balance_after', v_new_balance,
    'idempotent', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION clawback_stars(UUID, INT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION clawback_stars(UUID, INT, TEXT, TEXT) TO service_role;

-- ─── 3) admin_store_revenue ─────────────────────────────────────
-- 스토어 결제(apple/google)를 pg_provider 별로 집계. pending 은 제외.
-- payments/gross_won = 기간 내 완료+환불 전체, refunded/refunded_won = 그 중 환불분,
-- shortfall_stars = 환불 때 못 거둔 별 합계.
-- user_id 가 NULL(탈퇴 익명 보존 행)이어도 제외 목록과 비교해 사라지지 않게 IS NULL 을 명시한다.
CREATE OR REPLACE FUNCTION admin_store_revenue(
  p_since TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (
  provider TEXT,
  payments BIGINT,
  gross_won BIGINT,
  refunded BIGINT,
  refunded_won BIGINT,
  shortfall_stars BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.pg_provider::TEXT,
         count(*)::BIGINT,
         coalesce(sum(p.amount_won), 0)::BIGINT,
         count(*) FILTER (WHERE p.status = 'refunded')::BIGINT,
         coalesce(sum(p.amount_won) FILTER (WHERE p.status = 'refunded'), 0)::BIGINT,
         coalesce(sum(coalesce(p.clawback_shortfall, 0)), 0)::BIGINT
    FROM payments p
   WHERE p.pg_provider IN ('apple', 'google')
     AND p.status <> 'pending'
     AND p.created_at >= p_since
     AND (p.user_id IS NULL OR p.user_id <> ALL(coalesce(p_exclude, '{}')))
   GROUP BY p.pg_provider
   ORDER BY p.pg_provider;
$$;

REVOKE EXECUTE ON FUNCTION admin_store_revenue(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_store_revenue(TIMESTAMPTZ, UUID[]) TO service_role;
