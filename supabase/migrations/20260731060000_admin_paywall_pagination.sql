-- 어드민 페이월 미결제 목록 — 페이지네이션 (2026-07-31)
--
-- 왜: /admin/paywall 이 "페이월 도달·미결제" 유저를 한 표에 전부 쏟아붓는다 —
-- 2026-07-31 실측 398행, 약 24명/일 증가. 20260731020000 은 p_limit DEFAULT 5000(≈190일 여유)
-- + 앱측 truncated 경고로 막아뒀지만 그건 "조용히 잘리지 않게" 하는 안전망이지 해결이 아니다
-- (그 주석도 "근본 해결은 페이지네이션"이라고 적어뒀다). 여기서 OFFSET 을 붙여 실제로 해결한다.
--
-- 🔴 20260731020000 은 dev·prod 에 **이미 적용됐다** — 그 파일을 고쳐도 Supabase 가 다시 돌리지
--    않는다. 그래서 인플레이스 수정이 아니라 새 마이그레이션에서 CREATE OR REPLACE 한다.
-- 🔴 인자를 추가하면 **새 시그니처**가 생긴다 — CREATE OR REPLACE 는 이름이 아니라 시그니처
--    단위라 구 4인자 함수가 그대로 남는다. 둘 다 뒤쪽 인자에 DEFAULT 가 있어 4인자 호출은
--    "function is not unique" 로 깨지고, 그 전까지는 어느 오버로드에 닿는지가 호출부의 인자
--    모양에 따라 조용히 갈린다. → 구 시그니처를 **명시적으로 DROP** 해 고아 오버로드를 남기지
--    않는다(아래 순서: 새 함수 CREATE → 구 함수 DROP).
-- ⚠️ 본문 컬럼은 전부 별칭 수식한다 — RETURNS TABLE 의 OUT 파라미터가 본문 스코프에 들어와
--    CTE 컬럼과 이름이 겹친다.

-- ── 페이월 도달·미결제 목록 (LIMIT/OFFSET) ──
-- 본문은 20260731020000 과 **동일**하고, 달라진 곳은 딱 둘이다:
--   ① p_offset 인자 추가 + OFFSET 절
--   ② ORDER BY 에 r.user_id 타이브레이커 추가
-- ⚠️ ②는 선택이 아니라 필수다. OFFSET 페이지네이션은 정렬이 **전순서**가 아니면 성립하지
--    않는다 — created_at 이 같은(또는 둘 다 NULL 이라 NULLS LAST 안에서 동률인) 행들의 상대
--    순서를 Postgres 가 보장하지 않아, 같은 행이 두 페이지에 중복으로 나오고 다른 행은 통째로
--    빠질 수 있다. 바뀌는 것은 **동률 그룹 내부의 표시 순서뿐**이고 행 집합·건수는 불변이다.
-- ⚠️ utm 은 단순 LEFT JOIN 이다. `user_acquisition` 의 **PK 가 user_id** 라 유저당 정확히 1행이고,
--    그래서 first-touch/last-touch 구분 자체가 성립하지 않는다(20260731020000 주석 참조).
--    조인이 행을 불리지 않는다는 이 성질은 페이지네이션의 전제이기도 하다 — 유저당 1행이
--    아니면 OFFSET 이 "유저 N명 건너뛰기"를 뜻하지 않게 된다.
-- ⚠️ p_offset 은 음수를 가정하지 않는다(Postgres 가 "OFFSET must not be negative" 로 에러).
--    호출부(app/admin/paywall/page.tsx)가 ?page 를 1 이상으로 클램프한다.
CREATE OR REPLACE FUNCTION admin_paywall_unconverted(
  p_exclude UUID[], p_min_cost INT, p_aliases JSONB, p_limit INT DEFAULT 5000, p_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id UUID, nickname TEXT, created_at TIMESTAMPTZ,
  balance INT, total_spent INT, readings BIGINT, utm TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH reached AS (
    SELECT sb.user_id AS user_id,
           coalesce(sb.balance, 0) AS balance,
           coalesce(sb.total_spent, 0) AS total_spent
    FROM star_balances sb
    WHERE sb.user_id <> ALL(p_exclude)
      AND coalesce(sb.total_spent, 0) > 0
      AND coalesce(sb.balance, 0) < p_min_cost
      AND NOT EXISTS (
        SELECT 1 FROM payments p WHERE p.user_id = sb.user_id AND p.status = 'completed'
      )
  )
  SELECT r.user_id,
         u.nickname,
         u.created_at,
         r.balance,
         r.total_spent,
         (SELECT count(*) FROM readings rd WHERE rd.user_id = r.user_id),
         admin_canonical_creative(a.utm_content, p_aliases)
  FROM reached r
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN user_acquisition a ON a.user_id = r.user_id
  ORDER BY u.created_at DESC NULLS LAST, r.user_id
  LIMIT p_limit OFFSET p_offset;
$$;

-- 구 4인자 시그니처 제거 — 위 CREATE 는 이걸 대체하지 않고 **옆에** 새로 만든다.
-- CASCADE 는 쓰지 않는다: 이 함수에 붙은 의존 객체가 있다면 조용히 지우는 대신 에러로 드러나야
-- 한다(2026-07-31 현재 호출부는 app/admin/paywall/page.tsx 하나뿐이고 뷰·다른 함수는 없다).
DROP FUNCTION admin_paywall_unconverted(UUID[], INT, JSONB, INT);

-- ── 권한: service_role 전용 (게이트는 페이지/라우트의 requireAdmin·middleware 가 담당) ──
-- AGENTS.md 규칙 — PUBLIC·anon·authenticated 셋 다 명시 회수 + **새 완전 시그니처** 명시.
-- 새로 태어난 함수라 20260731020000 의 회수는 이 함수에 적용되지 않는다. 2026-07-29 이후
-- 기본 권한이 닫혀 있어(전역 f {postgres, service_role}) 닫힌 채 태어나지만, 기본값은 언제든
-- 플랫폼 쪽에서 되돌아갈 수 있으므로 이중 방어로 명시 회수를 그대로 유지한다.
REVOKE EXECUTE ON FUNCTION admin_paywall_unconverted(UUID[], INT, JSONB, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_paywall_unconverted(UUID[], INT, JSONB, INT, INT) TO service_role;
