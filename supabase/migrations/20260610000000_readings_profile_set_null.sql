-- 프로필 삭제 시 과거 readings 보존 (saju_data 스냅샷 이미 보유) — CASCADE → SET NULL
-- 기존 제약 이름은 Postgres 기본 명명 규칙(readings_profile_id_fkey).
ALTER TABLE readings
  DROP CONSTRAINT IF EXISTS readings_profile_id_fkey;

ALTER TABLE readings
  ADD CONSTRAINT readings_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
