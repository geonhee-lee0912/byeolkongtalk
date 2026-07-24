-- 20260724000000_messages_skill_key.sql — 스킬 인-스레드(Phase 1 판정) 토대
-- 관계 스레드에서 스킬 세그먼트(판정 등) 중 생성된 메시지를 태깅한다.
-- 일일 소프트캡 계산(getTodayThreadTurns)이 role='user' AND skill_key IS NULL 만 세도록 →
-- 유료 스킬 턴을 무료 자유대화 캡에서 제외(이중과금 방지). 비파괴적(nullable 추가).
-- (readings.skill_key 는 VARCHAR(20); 여긴 스펙대로 30 — 둘 다 'verdict'(7자) 여유.)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS skill_key VARCHAR(30);
