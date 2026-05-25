-- 20260602000000_sync_check.sql
-- main 브랜치 GitHub sync 검증용 no-op 마이그레이션.
-- 배경: Phase 4 (a) 첫 main push 에서 마이그레이션 ordering 충돌로
--      Supabase 가 4개 마이그레이션 묶음을 abort. main 의 schema_migrations
--      history 를 수동 backfill 한 후, 새 push 가 자동 적용되는지 검증하기 위함.
-- 다음 마이그레이션 (Phase 4 b auth) 부터는 같은 베이스라인 위에서 정상 동작 기대.

-- noop
SELECT 1 AS sync_check;
