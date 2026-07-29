-- SECURITY DEFINER RPC 의 EXECUTE 를 anon·authenticated 에서 회수 (2026-07-29)
--
-- 🔴 사고: prod 의 charge_stars · spend_stars · purchase_relationship_pass 가 **공개 anon 키로
--    실행 가능한 상태**였다. 셋 다 SECURITY DEFINER(=RLS 우회)이고 호출자 신원 검사가 없다
--    (p_user_id 를 호출자가 그냥 넘긴다). 서버만 호출한다는 전제로 설계됐는데 그 전제가
--    실제로는 강제되지 않았다.
--
-- 왜 기존 REVOKE 가 안 먹었나 — "REVOKE 를 썼다 != 먹었다":
--   기존 마이그레이션은 `REVOKE EXECUTE ON FUNCTION x FROM PUBLIC` 만 했다. 그건 실제로 먹었다
--   (proacl 에 PUBLIC 항목 `=X/` 이 없다). 문제는 Supabase 가 `ALTER DEFAULT PRIVILEGES` 로
--   public 스키마 신규 함수에 **anon·authenticated 직접 grant** 를 붙인다는 것이다
--   (pg_default_acl 로 확인: `anon=X/postgres, authenticated=X/postgres`).
--   직접 grant 는 PUBLIC 경유가 아니므로 PUBLIC revoke 로 지워지지 않는다.
--   → proacl 이 {postgres=X, anon=X, authenticated=X, service_role=X} 로 남아 있었다.
--
-- 검증 방법 (⚠️ 함정): PostgREST 는 인자 모양이 안 맞으면 **404** 를 준다. 권한 거부도 404 다.
--   그래서 "404 니까 막혔다" 는 오판이 되기 쉽다 — 반드시 **함수별 정확한 인자**로 호출할 것.
--   실제로 이 사고는 인자를 잘못 맞춰 3개가 404 로 나와 하마터면 안전으로 오판할 뻔했다.
--
-- 영향: 앱 동작 변화 0. `.rpc(` 호출부는 코드 전체에 3곳뿐이고
--   (lib/stars.ts:33·65, lib/relationship/passes.ts:53) 전부 getServiceSupabase() = service_role 이다.
--
-- ⚠️ 이 마이그레이션은 **오늘 존재하는 함수만** 고친다. 앞으로 public 스키마에 만드는 모든
--    SECURITY DEFINER 함수는 같은 default privileges 때문에 다시 anon 에 열린 채 태어난다.
--    새 RPC 를 추가할 때마다 아래 REVOKE 2줄을 함께 쓸 것. (구조적 차단은 별건 —
--    ALTER DEFAULT PRIVILEGES 를 손대는 건 프로젝트 전역 자세 변경이라 따로 결정한다)

-- ── 1. 별·결제 RPC (사고 본체) ──
REVOKE EXECUTE ON FUNCTION spend_stars(UUID, INT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION charge_stars(UUID, INT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION purchase_relationship_pass(UUID, UUID, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION spend_stars(UUID, INT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION charge_stars(UUID, INT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION purchase_relationship_pass(UUID, UUID, TEXT, INT, INT) TO service_role;

-- ── 2. 어드민 트래픽 집계 RPC (20260729000000 에서 같은 실수를 했다) ──
REVOKE EXECUTE ON FUNCTION admin_normalize_entry(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_trend(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_visitor_mix(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_routes(TIMESTAMPTZ, UUID[], DATE, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_auth(TIMESTAMPTZ, UUID[], DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_entry(TIMESTAMPTZ, UUID[], TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_traffic_bot(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION admin_normalize_entry(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_trend(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_visitor_mix(TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_routes(TIMESTAMPTZ, UUID[], DATE, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_auth(TIMESTAMPTZ, UUID[], DATE) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_entry(TIMESTAMPTZ, UUID[], TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_traffic_bot(TIMESTAMPTZ, UUID[]) TO service_role;

-- ── 3. 사후 확인용 쿼리 (실행 아님 — 복붙해서 쓸 것) ──
-- select p.proname, p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.prokind='f' and p.proacl::text like '%anon=X%';
-- → 0행이어야 한다. 행이 나오면 그 함수는 공개 anon 키로 실행 가능하다.
