-- 20260525000002_drop_integration_check.sql
-- 연동 검증 후 임시 테이블 정리
-- _integration_check 가 적용·삭제 모두 자동으로 흐르는지 최종 확인

DROP TABLE IF EXISTS public._integration_check;
