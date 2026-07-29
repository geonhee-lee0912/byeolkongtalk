-- 기본 권한 회수 보강 — 함수의 **내장 PUBLIC EXECUTE** 까지 (2026-07-29)
--
-- 🔴 20260729020000 이 불완전했다. 카나리아가 잡았다.
--
-- 무슨 일이 있었나:
--   20260729020000 은 `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS
--   FROM anon, authenticated` 를 했다. 이건 **Supabase 가 심어둔 기본 권한**을 지운다.
--   그런데 `CREATE FUNCTION` 은 그와 별개로 **Postgres 내장 동작**으로 PUBLIC 에
--   EXECUTE 를 준다. anon 은 PUBLIC 의 일원이므로 여전히 실행 가능했다.
--
--   카나리아 함수 ACL: {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--                       ^^^ 맨 앞 빈 이름 = PUBLIC
--   anon 키로 실제 호출 → **HTTP 200, 값 반환**. (같은 시점 카나리아 테이블은 401)
--
--   테이블에는 이 문제가 없다 — 테이블의 내장 기본값은 소유자 전용이라
--   PUBLIC 항목이 애초에 생기지 않는다(카나리아 테이블 ACL 로 확인).
--
-- 교훈: 이번에도 "설정을 썼다 != 먹었다" 였다. 기본 권한을 바꿀 때는 반드시
--   **새로 만든 객체를 실제로 anon 키로 찔러보고** 판정할 것. 카탈로그만 보면 놓친다.
--
-- 기존 함수 10개는 무사하다 — 20260729010000 이 `FROM PUBLIC, anon, authenticated` 로
--   셋 다 명시했기 때문. 빠져 있던 건 **기본값**뿐이다.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ── 카나리아 함수 재생성 ──
-- ⚠️ CREATE OR REPLACE 는 **기존 GRANT 를 보존한다.** 새 기본 권한을 물려받게 하려면
--    반드시 DROP 후 CREATE 해야 한다. (그래서 20260729020000 의 CREATE OR REPLACE 를
--    그대로 다시 돌리는 것으로는 검증이 안 된다)
DROP FUNCTION IF EXISTS _canary_default_privs_fn();

CREATE FUNCTION _canary_default_privs_fn()
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 1 $$;

-- 검증: anon 키로 POST /rest/v1/rpc/_canary_default_privs_fn → **401** 이어야 한다.
--       (404 는 인자 불일치와 구분이 안 되므로 판정 근거로 쓰지 말 것)
--       ACL 에 `=X/` (PUBLIC) 항목이 없어야 한다.
