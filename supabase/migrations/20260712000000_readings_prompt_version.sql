-- 20260712000000_readings_prompt_version.sql
-- 상담(사주·타로) 리딩이 어떤 페르소나/프롬프트 버전으로 생성됐는지 기록 — 전후 데이터 비교용.
-- 기존 상담 리딩은 스탬프 도입 전이므로 'pre-2026-07-12' baseline 으로 백필.
-- 운세 리포트(emotion_tag LIKE 'fortune:%')는 다른 프롬프트라 대상 아님(NULL 유지).
ALTER TABLE readings ADD COLUMN IF NOT EXISTS prompt_version TEXT;

UPDATE readings
   SET prompt_version = 'pre-2026-07-12'
 WHERE prompt_version IS NULL
   AND (emotion_tag IS NULL OR emotion_tag NOT LIKE 'fortune:%');
