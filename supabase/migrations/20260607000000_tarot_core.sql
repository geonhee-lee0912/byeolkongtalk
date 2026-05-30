-- 20260607000000_tarot_core.sql — 타로 도메인 도입 (readings 공용화)
-- 기존 readings 는 사주 전용 (profile_id / saju_data NOT NULL) → 타로도 같은 테이블 재사용.
--
-- 타로 reading 은 profile / saju_data 가 없으므로 NOT NULL 완화 + 타로 전용 컬럼 추가.
-- consultation_type 으로 도메인 구분 (기존 행은 전부 'saju' 로 backfill).
-- messages / star_transactions 체인은 그대로 (reading_id FK 공유).

-- 도메인 구분 컬럼 — 기존 행은 default 'saju' 로 채워짐
ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS consultation_type VARCHAR(10) NOT NULL DEFAULT 'saju'
  CHECK (consultation_type IN ('saju', 'tarot'));

-- 타로 전용 컬럼 (전부 nullable — 사주 행은 NULL)
ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS spread_type VARCHAR(20);
ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS spread_category VARCHAR(20);
ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS emotion_tag VARCHAR(20);
-- drawn_cards: [{ position, label, card_id, direction }]
ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS drawn_cards JSONB;

-- 사주 전용이던 NOT NULL 완화 (타로 행은 profile / saju 없음)
ALTER TABLE readings ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE readings ALTER COLUMN saju_data DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_readings_consultation_type
  ON readings(user_id, consultation_type, created_at DESC);
