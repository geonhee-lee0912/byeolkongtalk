-- public 시퀀스에서 anon·authenticated 권한 회수 (기존 + 기본값).
--
-- 배경 (2026-10-21):
--   20260729020000 은 public 의 TABLES·FUNCTIONS 기본권한만 회수했고 SEQUENCES 는 빠졌다.
--   prod 실측: postgres 소유 public 시퀀스 기본권한 = {anon,authenticated,service_role}=rwU,
--   기존 시퀀스 6개(page_views_id_seq 등)도 전부 anon·authenticated rwU 보유.
--   실위험은 사실상 0 — PostgREST 는 시퀀스를 노출하지 않고, 시퀀스를 건드릴 테이블
--   INSERT·함수 EXECUTE 는 이미 anon 에 닫혀 있다. "public 은 anon·authenticated 에
--   아무것도 주지 않는다" 원칙의 마지막 예외를 닫는 이중 방어다.
--
-- 시퀀스는 내장 PUBLIC 기본권한이 없어 per-schema 회수로 충분하다(함수와 다름 — 20260729040000).
-- supabase_admin 소유 기본권한은 우리가 못 바꾸지만, 우리 마이그레이션은 postgres 로 돈다.
-- service_role 은 그대로 둔다(20261021000000 이 명시 부여).
--
-- 검증: 적용 뒤 아래 둘 다 anon·authenticated 가 없어야 한다.
--   select relname, relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='S';
--   select defaclacl from pg_default_acl
--    where defaclrole='postgres'::regrole and defaclnamespace='public'::regnamespace and defaclobjtype='S';
--
-- 롤백:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
--   GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
