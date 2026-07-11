-- 20260711000000_readings_result_viewed.sql
-- 결과 화면(재충전 블록) 열람 추적 — 상담 완료 퍼널의 "[END] → 결과 열람" 단계 계량용.
-- nullable 컬럼 추가 (기존 행은 NULL, 데이터 변경/백필 없음). 열람 시점은 배포 이후 생성분부터 정확.
ALTER TABLE readings ADD COLUMN IF NOT EXISTS result_viewed_at TIMESTAMPTZ;
