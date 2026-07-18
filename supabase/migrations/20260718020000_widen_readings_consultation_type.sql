-- 20260718020000_widen_readings_consultation_type.sql
-- 버그: 'relationship'(12자)이 readings.consultation_type VARCHAR(10) 을 초과 → 스레드 reading INSERT 가
--       22001 "value too long for type character varying(10)" 로 실패 (등록 thread_failed).
-- 20260718000000 이 CHECK 제약엔 'relationship' 을 넣었지만 컬럼 폭은 그대로 10 이었음.
-- 폭만 확장 (값·제약 불변, 비파괴적).
ALTER TABLE readings ALTER COLUMN consultation_type TYPE VARCHAR(20);
