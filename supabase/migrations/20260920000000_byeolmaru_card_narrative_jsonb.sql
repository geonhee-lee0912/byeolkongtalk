-- 20260920000000_byeolmaru_card_narrative_jsonb.sql — 오늘 타로 유료 캐시를 자유 줄글(TEXT)에서 7블록 리포트(JSONB)로.
-- 스펙 2026-09-19 §11-1-2. 구버전 자유 줄글 행은 ::jsonb 캐스트가 실패하므로 TRUNCATE 후 컬럼을 교체한다
-- (하루 캐시라 잃는 건 "오늘 이미 본 사람의 재생성 1회"뿐). 이 TRUNCATE 가 §11-1-3(배포 시각 구버전 캐시)도 함께 해소한다 —
-- 마이그레이션은 배포 시점에 돌아 그날 캐시된 구버전 행을 지운다. 포맷 버전은 JSON 안 v:1(lib/byeolmaru/card-report.ts isCardReport).
-- 컬럼명은 형제 byeolmaru_daily_report(report JSONB)와 맞춘다.
TRUNCATE TABLE byeolmaru_card_narrative;
ALTER TABLE byeolmaru_card_narrative DROP COLUMN narrative;
ALTER TABLE byeolmaru_card_narrative ADD COLUMN report JSONB NOT NULL;
-- RLS·REVOKE·GRANT 는 테이블 단위라 20260919000000 의 설정이 그대로 유효하다(컬럼 교체는 권한을 바꾸지 않는다).
