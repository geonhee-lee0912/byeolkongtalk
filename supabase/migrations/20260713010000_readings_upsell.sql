-- C3 인챗 업셀: 대화 연장(+4턴/구매) 및 보조 카드(clarifier) 횟수 — 수렴 임계치 보정용.
ALTER TABLE readings ADD COLUMN IF NOT EXISTS extra_turns INT NOT NULL DEFAULT 0;
ALTER TABLE readings ADD COLUMN IF NOT EXISTS clarifier_count INT NOT NULL DEFAULT 0;
