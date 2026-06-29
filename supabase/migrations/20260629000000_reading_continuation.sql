-- 고민 이어가기: 완료된 reading 을 참조하는 새 reading.
-- previous_reading_id 부모 삭제 시 SET NULL (이어가기 reading 자체는 보존, 요약 주입만 사라짐).

ALTER TABLE readings
  ADD COLUMN previous_reading_id uuid REFERENCES readings(id) ON DELETE SET NULL,
  ADD COLUMN continuation_mode text CHECK (continuation_mode IN ('fresh', 'deep'));

CREATE INDEX idx_readings_previous
  ON readings(previous_reading_id)
  WHERE previous_reading_id IS NOT NULL;
