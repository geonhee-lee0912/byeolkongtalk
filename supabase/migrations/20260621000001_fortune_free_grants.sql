-- 20260621000001_fortune_free_grants.sql — 어드민이 부여한 무료 운세 보너스 횟수
-- 무료 잔여는 (freeLimit - 사용분) 파생값이라 저장 카운터가 없다.
-- 어드민이 횟수를 늘리려면 per-user 보너스가 필요 → 이 테이블 합산.
CREATE TABLE IF NOT EXISTS fortune_free_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fortune_kind VARCHAR(40) NOT NULL,   -- FortuneType 키 (daily | tarot_daily | ...)
  bonus_count INTEGER NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fortune_grants_user
  ON fortune_free_grants(user_id, fortune_kind);

ALTER TABLE fortune_free_grants ENABLE ROW LEVEL SECURITY;
