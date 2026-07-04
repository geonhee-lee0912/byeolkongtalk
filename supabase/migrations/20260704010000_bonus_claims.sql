-- 20260704010000_bonus_claims.sql — 보너스 파밍 방지
-- 탈퇴해도 남는 지급 원장(웰컴/첫충전 각 1인 1회).
-- users 와 무관(FK/CASCADE 없음) — 탈퇴→재가입해도 "이미 받음"을 기억.
-- kakao_id 는 sha256 해시로만 저장(원본 미보관, 부정 방지 목적 식별자).
CREATE TABLE IF NOT EXISTS bonus_claims (
  kakao_id_hash TEXT NOT NULL,
  -- CHECK: 오타(예: 'first-charge')가 별도 청구 네임스페이스를 만들어 파밍이 재개되는 것 방지
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('welcome', 'first_charge')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kakao_id_hash, bonus_type)
);

-- RLS: service_role 만 RW (클라는 /api/* 라우트 경유)
ALTER TABLE bonus_claims ENABLE ROW LEVEL SECURITY;
