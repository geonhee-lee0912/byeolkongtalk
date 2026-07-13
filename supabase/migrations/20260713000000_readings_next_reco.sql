-- 20260713000000_readings_next_reco.sql
-- 결과 화면 "다음 상담 추천" — [RECO:] 마커(1순위) 또는 haiku 태깅(2순위) 결과.
-- { product, question, hook, source: 'marker'|'haiku', created_at }
ALTER TABLE readings ADD COLUMN IF NOT EXISTS next_reco JSONB;
