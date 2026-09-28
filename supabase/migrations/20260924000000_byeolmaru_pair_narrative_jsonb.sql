-- 20260924000000_byeolmaru_pair_narrative_jsonb.sql — 우리 오늘 유료 캐시를 자유 줄글(TEXT)에서 5블록 리포트(JSONB)로.
-- 형제 20260920000000_byeolmaru_card_narrative_jsonb.sql(오늘 타로 7블록)과 **같은 절차**다 — 그쪽 주석이 근거의 원본.
--
-- 왜: 우리 오늘에도 오늘 사주·오늘 타로와 같은 무료/유료 경계(PaywallCut 절단선)를 두기로 했다(2026-09-24 사용자 결정).
-- 절단선은 블러 위에 "무엇이 더 있는지"를 섹션 이름으로 약속하는데, 자유 줄글엔 약속할 이름이 없었다.
-- 블록 정의·포맷 버전(v:1)은 lib/byeolmaru/pair-report.ts 가 정본(isPairReport).
--
-- 구버전 자유 줄글 행은 ::jsonb 캐스트가 실패하므로 TRUNCATE 후 컬럼을 교체한다.
-- 잃는 것은 "오늘 이미 본 사람의 재생성 1회"뿐이다 — 이 테이블은 (user, partner, 날짜)당 1행인 하루 캐시고,
-- 지워져도 다음 요청에서 다시 생성된다(원가 회당 ₩1 수준). 캐시의 목적은 원가가 아니라 일관성·속도다.
-- 🔴 별마루는 prod 에 아직 나간 적이 없어(byeolmaru_watch 테이블 부재) prod 에서 지울 행 자체가 0이다.
--    dev 에서만 실질 효과가 있다.
--
-- 컬럼명은 형제들(byeolmaru_daily_report.report · byeolmaru_card_narrative.report)과 맞춘다.
TRUNCATE TABLE byeolmaru_pair_narrative;
ALTER TABLE byeolmaru_pair_narrative DROP COLUMN IF EXISTS narrative;
ALTER TABLE byeolmaru_pair_narrative ADD COLUMN IF NOT EXISTS report JSONB NOT NULL;
-- RLS·REVOKE·GRANT 는 테이블 단위라 20260914000000 의 설정이 그대로 유효하다(컬럼 교체는 권한을 바꾸지 않는다).
