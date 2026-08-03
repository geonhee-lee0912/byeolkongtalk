-- 20260803010000_profile_mbti_personality.sql — 프로필에 MBTI·성격 + 생일 옵션화
-- P2: 사람 속성(생일·MBTI·성격)이 다 독립 옵션 → 생일 없이도 프로필 존재 가능.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mbti VARCHAR(4);        -- NULL=모름
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS personality TEXT;       -- NULL=미입력, 자유서술
ALTER TABLE user_profiles ALTER COLUMN birth_date DROP NOT NULL;           -- 생일 옵션화
