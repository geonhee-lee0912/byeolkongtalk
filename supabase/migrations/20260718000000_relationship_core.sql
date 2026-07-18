-- 20260718000000_relationship_core.sql — W1 사이클 2 "우리 사이" 코어
-- relationships(관계 파일, 유저당 1개) + relationship_passes(기간권) + readings 확장(스레드/스킬 귀속)

-- 1) 관계 파일
CREATE TABLE IF NOT EXISTS relationships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label               VARCHAR(50) NOT NULL,                     -- 호칭
  status              VARCHAR(20) NOT NULL
                        CHECK (status IN ('crush','dating','breakup','onesided')), -- 썸/연애중/이별/짝사랑
  self_profile_id     UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  partner_profile_id  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  thread_reading_id   UUID REFERENCES readings(id) ON DELETE SET NULL,
  rolling_summary     TEXT,
  summarized_msg_count INT NOT NULL DEFAULT 0,                  -- rolling_summary가 커버한 older 메시지 수
  memo                JSONB NOT NULL DEFAULT '{}'::jsonb,       -- prescriptions/pending_checkin/skill_log
  last_visited_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_user_one ON relationships(user_id); -- v1 단일
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

-- 2) 기간권 패스
CREATE TABLE IF NOT EXISTS relationship_passes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  kind            VARCHAR(10) NOT NULL CHECK (kind IN ('day1','day3','day7')),
  stars_spent     INT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passes_active
  ON relationship_passes(relationship_id, expires_at DESC);
ALTER TABLE relationship_passes ENABLE ROW LEVEL SECURITY;

-- 3) readings 확장 — 스레드 본체 + 스킬 자식 귀속
ALTER TABLE readings
  DROP CONSTRAINT IF EXISTS readings_consultation_type_check;
ALTER TABLE readings
  ADD CONSTRAINT readings_consultation_type_check
  CHECK (consultation_type IN ('saju','tarot','relationship'));
ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS relationship_id UUID REFERENCES relationships(id) ON DELETE CASCADE;
ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS skill_key VARCHAR(20);  -- 스킬 reading 식별(스레드=NULL). 확장 훅
CREATE INDEX IF NOT EXISTS idx_readings_relationship
  ON readings(relationship_id, created_at) WHERE relationship_id IS NOT NULL;
