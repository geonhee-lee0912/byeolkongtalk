-- readings.emotion_tag 폭 확장 — VARCHAR(20) → VARCHAR(40).
-- 사유: 운세 센티넬 `fortune:compat_social` (21자) 이 20자 한도를 넘겨 INSERT 가
--       Postgres 22001 (value too long) 로 실패 → 리딩 생성 실패 + 별 환불 (사라짐).
-- 확장은 무손실/안전.

ALTER TABLE readings ALTER COLUMN emotion_tag TYPE VARCHAR(40);
