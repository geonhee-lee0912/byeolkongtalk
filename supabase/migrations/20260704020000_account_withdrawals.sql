-- 20260704020000_account_withdrawals.sql — 탈퇴 이력 원장(append-only)
-- 탈퇴해도 남아 재가입/탈퇴 횟수 집계 가능.
-- users 와 무관(FK/CASCADE 없음) — 탈퇴 후에도 행이 보존됨.
-- kakao_id 는 sha256 해시로만 저장(원본 미보관, 개인정보 최소화).
CREATE TABLE IF NOT EXISTS account_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kakao_id_hash TEXT NOT NULL,
  withdrawn_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_withdrawals_kakao
  ON account_withdrawals(kakao_id_hash);

-- RLS: service_role 만 RW (클라는 /api/* 라우트 경유)
ALTER TABLE account_withdrawals ENABLE ROW LEVEL SECURITY;
