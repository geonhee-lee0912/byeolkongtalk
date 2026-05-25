-- 20260605000000_saju_core.sql — Phase 5 (a) 사주 도메인 코어
-- user_profiles (1:N + primary 1개) + readings + messages + star_transactions.reading_id FK ALTER.
--
-- ON DELETE CASCADE 체인:
--   users 삭제 → user_profiles → readings → messages + star_transactions.reading_id SET NULL
--   = withdraw 라우트에서 users 만 삭제하면 도메인 데이터 자동 정리.

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(50) NOT NULL,
  relation_type VARCHAR(20) NOT NULL CHECK (
    relation_type IN ('self', 'family', 'friend', 'partner', 'other')
  ),
  birth_date DATE NOT NULL,
  birth_time TIME,                              -- NULL = 시간 모름
  is_lunar_input BOOLEAN NOT NULL DEFAULT false, -- 입력 시 음력이었는지 (표시용)
  is_leap_month BOOLEAN NOT NULL DEFAULT false,  -- 음력 윤달 여부
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user
  ON user_profiles(user_id, is_primary DESC, created_at);

-- user 당 primary 1개만 보장 (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_primary
  ON user_profiles(user_id) WHERE is_primary = true;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  question TEXT,                                 -- 사용자 질문 (자유 텍스트, nullable)
  saju_data JSONB NOT NULL,                      -- calcSaju() 결과 그대로
  stars_spent INT NOT NULL DEFAULT 0,
  has_sensitive BOOLEAN NOT NULL DEFAULT false,  -- Phase 4 (e) 위기 시그널 플래그
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_readings_user
  ON readings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_profile
  ON readings(profile_id, created_at DESC);

ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_reading
  ON messages(reading_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Phase 4 (c) 에서 star_transactions.reading_id 컬럼만 있었고 FK 없었음 → 이제 FK ALTER.
-- ON DELETE SET NULL — reading 삭제돼도 트랜잭션 기록은 audit 용으로 유지.
ALTER TABLE star_transactions
  ADD CONSTRAINT star_transactions_reading_id_fkey
  FOREIGN KEY (reading_id) REFERENCES readings(id) ON DELETE SET NULL;
