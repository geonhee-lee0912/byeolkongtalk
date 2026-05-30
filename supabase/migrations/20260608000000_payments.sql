-- 20260608000000_payments.sql — 토스페이먼츠 결제 기록 테이블
-- v1 (tarot-friend) 의 payments 스키마 이식. 결제 confirm 라우트가 INSERT,
-- charge_stars RPC 의 payment_id 는 이 테이블의 id(UUID) 를 문자열로 받음.

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pg_provider VARCHAR(20) NOT NULL DEFAULT 'tosspayments',
  pg_tid VARCHAR(100),
  amount_won INT NOT NULL,
  stars_given INT NOT NULL,
  package_type VARCHAR(20) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 멱등성 조회용 (confirm 라우트가 pg_tid 로 중복 확인)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_pg_tid
  ON payments(pg_tid) WHERE pg_tid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user
  ON payments(user_id, created_at DESC);

-- RLS: service_role 만 RW (클라는 /api/payment/* · /api/payments/* 경유)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
