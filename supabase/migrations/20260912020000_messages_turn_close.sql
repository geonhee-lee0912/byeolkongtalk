-- messages.turn_close (2026-09-12)
-- 배경: 유료 타로 무언 이탈 27%(결과열람 0~6%)·후속 질문률 7~10%.
--       턴 마무리 상한(ask/invite/settle)을 주입하는 변경의 판정을 위해
--       각 별콩이 발화가 어떤 상태에서 생성됐는지 남긴다.
-- 값: 'ask' | 'invite' | 'settle' | NULL(변경 이전 행·유저 행)
-- 실제로 질문으로 닫았는지는 사후에 content 의 물음표 위치로 계산 →
-- 상태 × 실제 행동 × 다음 턴 생존 교차가 가능해진다.
-- 판정 로직 정본 = lib/claude.ts 의 computeTurnClose (계약은 lib/claude.turn-close.test.ts).

ALTER TABLE messages ADD COLUMN IF NOT EXISTS turn_close TEXT;
