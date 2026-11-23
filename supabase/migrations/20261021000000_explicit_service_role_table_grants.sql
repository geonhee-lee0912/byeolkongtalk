-- public 테이블·시퀀스의 service_role 권한을 명시적으로 박는다.
--
-- 배경 (2026-10-21, Supabase 공지):
--   2026-10-30 부터 기존 프로젝트도 public 스키마 신규 테이블에 Data API 권한을 자동으로
--   주지 않는다. 메일의 예시가 service_role GRANT 까지 포함하므로 service_role 도
--   자동 부여에서 빠질 가능성이 높다고 본다.
--   지금 테이블들은 GRANT 문 없이 기본 권한(ALTER DEFAULT PRIVILEGES)에 기대고 있다
--   (예: 20261012000000_app_auth 의 user_identities 등 3개).
--   마이그레이션을 처음부터 다시 돌리는 경우(새 프리뷰 브랜치·로컬 db reset)에는 모든
--   테이블이 '신규'가 되어 service_role 권한 없이 태어난다 → 서버 전체가 permission denied.
--   이 파일이 마지막에 전부 다시 열어 준다.
--
-- 현재 DB 에서는 no-op 이다(2026-10-21 prod 실측: 테이블 36개·시퀀스 6개 전부 이미 보유).
-- anon·authenticated 에는 주지 않는다 — 앱은 service_role 로만 DB 에 접근한다
-- (lib/supabase.ts 의 anon 클라이언트 getSupabase 는 호출처 0).
--
-- 앞으로 테이블을 만드는 마이그레이션은 같은 파일에서 테이블별 GRANT 를 직접 쓴다
-- (AGENTS.md 코딩 규칙 'DB 권한 기본값').
--
-- 롤백: 불필요(기존 권한과 동일한 부여).

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;
