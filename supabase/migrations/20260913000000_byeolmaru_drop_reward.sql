-- 20260913000000_byeolmaru_drop_reward.sql — 별마루 출석 별 환급 폐지(P5-2, 스펙 §10).
-- 보상은 이제 "그날의 운세"다 — 달력 칸이 매일 하나씩 열리는 것 자체가 보상이라 10별 환급은 중복이고,
-- 구조가 거꾸로였다(환급은 구독자 전용인데 구독자는 이미 다 열려 있고, 매일 올 이유가 필요한 쪽은
-- 비구독자였다). 지급 코드(grantDueReward)는 같은 커밋에서 삭제됐다.
-- 🔴 prod(main)에 별마루 자체가 아직 없어 정리할 지급 이력이 없다 — dev 에서만 존재하던 컬럼이다.
ALTER TABLE byeolmaru_subscriptions DROP COLUMN IF EXISTS reward_granted_at;
