-- messages.turn_close (2026-09-12)
-- 배경: 유료 타로 무언 이탈 27%(결과열람 0~6%)·후속 질문률 7~10%.
--       턴 마무리 상한(ask/invite/settle)을 주입하는 변경의 판정을 위해
--       각 별콩이 발화가 어떤 상태에서 생성됐는지 남긴다.
-- 실제로 질문으로 닫았는지는 사후에 content 의 물음표 위치로 계산 →
-- 상태 × 실제 행동 × 다음 턴 생존 교차가 가능해진다.
-- 판정 로직 정본 = lib/claude.ts 의 computeTurnClose (계약은 lib/claude.turn-close.test.ts).
--
-- 🔴 NULL 의 의미 (분석 시 오독 주의 — "NULL = 옛날 데이터"가 아니다):
--   ① 이 마이그레이션 이전에 쌓인 행
--   ② 모든 user 역할 행 (상태는 별콩이 발화의 속성이다)
--   ③ 🔴 **배포 이후에도 영구적으로** — turnSignals 를 계산하지 않는 경로의 assistant 발화.
--      `app/api/relationship/chat/route.ts` 의 궁합(compat)·카드뽑기(카드 스트립 + 해석)·
--      판정 도입 발화 4곳과 `app/api/relationship/sim/*` 이 여기 해당한다.
--      → "turn_close IS NULL 비율"을 계측 누락률로 읽으면 과대 집계된다.
--        모수는 `consultation_type='tarot'|'saju'` 의 assistant 행으로 좁혀서 볼 것.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS turn_close TEXT;

-- 값 도메인을 CHECK 로 잠근다 — 리포 관례(messages.role, byeolmaru_watch.status)와 동일.
-- 오타·enum 밖 값이 새면 판정 쿼리가 조용히 틀린다.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_turn_close_check;
ALTER TABLE messages ADD CONSTRAINT messages_turn_close_check
  CHECK (turn_close IS NULL OR turn_close IN ('ask', 'invite', 'settle'));
