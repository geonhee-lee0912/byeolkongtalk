-- 20261010020000_ad_sync_active_creatives.sql — 동기화 시점에 Meta 에서 "지금 게재 중(ACTIVE)"인 광고 이름 목록
-- 왜: 대시보드 '광고 소재' 표는 지금 게재 중인 광고만 보여준다(꺼진 광고의 7일 지출이 표를 채우지 않게).
-- NULL = 기록 안 됨(이 마이그레이션 이전 실행이거나 게재 목록 조회가 실패한 실행). 지출 동기화 성공과는 별개다.
-- 기존 테이블에 컬럼만 추가 — 권한(RLS·REVOKE)은 20261010000000 에서 이미 닫혀 있고 새 함수는 없다.
ALTER TABLE ad_sync_runs ADD COLUMN IF NOT EXISTS active_creatives TEXT[];
