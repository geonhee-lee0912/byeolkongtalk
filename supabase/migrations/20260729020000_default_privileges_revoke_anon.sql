-- public 스키마 기본 권한에서 anon·authenticated 회수 (2026-07-29)
--
-- 왜: 2026-07-29 사고(별·결제 RPC 3개가 공개 anon 키로 실행 가능)의 **근본 원인**을 없앤다.
--   개별 REVOKE(20260729010000)는 "그때 존재하던 10개"만 고쳤다. Supabase 는
--   `ALTER DEFAULT PRIVILEGES` 로 public 스키마 신규 객체에 anon·authenticated 권한을
--   자동으로 붙이므로, **앞으로 만드는 함수·테이블은 다시 열린 채 태어난다.**
--   기본값을 닫아 "깜빡하면 사고"를 "깜빡해도 무해"로 바꾼다.
--
-- 회수 전 prod 실측 (pg_default_acl, 부여자 postgres):
--   함수   : {postgres=X,        anon=X,        authenticated=X,        service_role=X}
--   테이블 : {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--            (a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN)
--
-- 🔴 테이블 쪽이 함수보다 위험하다: 함수는 REVOKE 를 **추가로 써야** 막히지만,
--    테이블은 `ENABLE ROW LEVEL SECURITY` 를 **빠뜨리면** 뚫린다(신규 테이블 RLS 기본 OFF).
--    그리고 피해가 읽기에 그치지 않고 INSERT·UPDATE·DELETE 까지 간다.
--
-- 안전성: 이 앱은 DB 접근이 100% 서버측 service_role 이다.
--   `.rpc(` 호출부 3곳 전부 getServiceSupabase() 이고,
--   anon 클라이언트 `lib/supabase.ts` 의 getSupabase() 는 **호출처 0인 죽은 코드**다.
--   Realtime publication 도 테이블 0개. 즉 anon 롤을 쓰는 경로가 존재하지 않는다.
--   service_role 권한은 건드리지 않으므로 앱·어드민 동작 변화 0.
--
-- 적용 범위: 마이그레이션은 `postgres` 롤로 실행된다(public 의 모든 객체 owner/grantor 가
--   postgres 임을 실측 확인). 따라서 FOR ROLE 없이 쓴 이 문장이 앞으로의 모든
--   마이그레이션 산출물에 적용된다. supabase_admin 소유 내부 객체는 대상 아님(건드리면 안 됨).
--
-- ⚠️ 나중에 클라이언트에서 Supabase 를 직접 쓰려면(Realtime 구독·브라우저 직접 쿼리)
--    그 대상에 GRANT 를 **명시**해야 한다. 지금 아키텍처엔 해당 없고, 명시가 맞는 순서다.
--
-- 되돌리려면:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- ── 카나리아: "설정을 썼다"가 아니라 "먹었다"를 증명한다 ──
-- 오늘 사고의 교훈이 정확히 이것이다 — REVOKE 를 썼지만 안 먹었고, 그걸 몇 주간 몰랐다.
-- 아래 두 객체는 위 ALTER 직후에 생성되므로 **새 기본 권한을 그대로 물려받는다.**
-- 테이블은 RLS 를 **일부러 켜지 않는다** — RLS 없이도 anon 이 못 만지는 것이 이 변경의 요지다.
-- 데이터는 넣지 않는다. 검증이 끝나면 후속 마이그레이션(20260729030000)이 즉시 DROP 한다.
CREATE TABLE IF NOT EXISTS _canary_default_privs (id INT PRIMARY KEY, note TEXT);

CREATE OR REPLACE FUNCTION _canary_default_privs_fn()
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 1 $$;

-- 검증 쿼리 (복붙용):
--   select defaclobjtype, defaclacl::text from pg_default_acl d
--     join pg_namespace n on n.oid=d.defaclnamespace
--    where n.nspname='public' and d.defaclrole::regrole::text='postgres';
--   → anon / authenticated 가 없어야 한다
--
--   select relname, relacl::text from pg_class where relname='_canary_default_privs';
--   select proname, proacl::text from pg_proc where proname='_canary_default_privs_fn';
--   → 둘 다 anon= / authenticated= 항목이 없어야 한다
