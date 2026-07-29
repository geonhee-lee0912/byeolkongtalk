-- 함수 기본 권한: PUBLIC EXECUTE 전역 회수 + service_role 보정 (2026-07-29)
--
-- 🔴 20260729030000 은 효과가 없었다. Postgres 문서가 그 문장을 반례로 명시한다:
--    "per-schema default privileges can only **add** privileges to the global setting,
--     not remove privileges granted by it."
--    → `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
--      는 문서가 직접 "This command has no effect" 예시로 드는 바로 그 명령이다.
--    PUBLIC EXECUTE 는 **전역** 기본값이라 스키마 한정으로 못 뺀다. `IN SCHEMA` 를 빼야 한다.
--
--    같은 이유로 20260729020000 의 **함수** 관련 줄도 실질 효과가 0이었다 —
--    anon·authenticated 직접 grant 는 지워졌지만 PUBLIC 이 남아 anon 이 그 경로로 들어왔다.
--    (카나리아 실측: 함수 anon 200 / 테이블 anon 401)
--    **테이블 쪽 회수는 정상 작동한다** — 테이블엔 내장 PUBLIC 기본값이 없어서
--    per-schema 회수만으로 충분했다. 그건 그대로 둔다.
--
-- 이 마이그레이션이 하는 일 (전역 = IN SCHEMA 없음, 대상 롤 = 현재 롤 postgres):
--   1) 앞으로 postgres 가 만드는 모든 함수에서 PUBLIC EXECUTE 를 뗀다
--   2) 대신 service_role 에 EXECUTE 를 붙인다
--
-- (2)가 필요한 이유: (1)만 하면 나중에 `extensions` 스키마에 확장을 설치·업데이트할 때
--   생기는 함수가 **소유자 전용**이 되어 service_role 이 못 부른다. 예컨대 테이블 DEFAULT 의
--   gen_random_uuid() 를 service_role 이 INSERT 중에 호출하지 못해 깨질 수 있다.
--   현재 prod 의 extensions 스키마엔 postgres 소유 함수 49개(그중 48개가 PUBLIC 실행가능)가
--   있는데, 그 기존 48개는 이 변경의 영향을 받지 않는다(기본값은 신규 생성에만 적용).
--   service_role 은 이미 RLS 를 우회하는 전권 롤이므로 새 노출이 아니다.
--
-- 검증: 아래 카나리아 함수를 재생성한 뒤 **anon 키로 실제 호출**한다.
--   401 이어야 한다. 200 이면 이 마이그레이션을 되돌린다(아래 롤백 참조).
--   ⚠️ 404 는 인자 불일치와 구분이 안 되므로 판정 근거로 쓰지 말 것.
--
-- 롤백:
--   ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM service_role;

ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── 카나리아 함수 재생성 ──
-- CREATE OR REPLACE 는 기존 GRANT 를 보존하므로 반드시 DROP 후 CREATE.
DROP FUNCTION IF EXISTS _canary_default_privs_fn();

CREATE FUNCTION _canary_default_privs_fn()
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 1 $$;

-- 기대 ACL: {postgres=X/postgres, service_role=X/postgres}  ← 맨 앞 `=X/`(PUBLIC) 없음
