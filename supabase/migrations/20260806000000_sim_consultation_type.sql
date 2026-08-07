-- 20260806000000_sim_consultation_type.sql — 연애 시뮬레이션 판을 readings 로 저장(스펙 §8).
-- 신규 consultation_type 'relationship_sim'(16자) 추가.
-- 폭 검증: consultation_type 은 20260718020000 에서 VARCHAR(20) 으로 확장됨 → 16 <= 20, 폭 확장 불필요.
--          (AGENTS.md 폭 함정: CHECK 에 값만 넣고 폭을 안 늘려 22001 로 죽던 사례 재발 방지 — 여기선 이미 충분.)
-- CHECK 는 기존 값(saju/tarot/relationship, 20260718000000)을 보존하고 새 값만 추가. 비파괴적.
ALTER TABLE readings
  DROP CONSTRAINT IF EXISTS readings_consultation_type_check;
ALTER TABLE readings
  ADD CONSTRAINT readings_consultation_type_check
  CHECK (consultation_type IN ('saju','tarot','relationship','relationship_sim'));
-- 시뮬 판은 relationship_id 를 세팅하므로 기존 idx_readings_relationship(20260718000000) 이 이미 커버 — 신규 인덱스 불필요.
