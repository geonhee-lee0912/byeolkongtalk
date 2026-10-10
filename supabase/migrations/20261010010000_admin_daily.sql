-- 20261010010000_admin_daily.sql — 대시보드 "매일 보기" 재구성
-- 설계: docs/superpowers/specs/2026-10-10-대시보드-매일보기-재구성-design.md
--
-- 1) admin_seen_markers — "어디까지 봤나". 대시보드 새 설문 인박스의 기준선(key='survey').
--    seen_until = 누른 시각이 아니라 화면에 보였던 마지막 응답의 created_at(보는 사이 들어온 응답 보존).
-- 2) admin_pay_rate — 가입 KST 날짜별 가입자 · 48시간 안 결제자 · P1(첫 리딩 전 첫 결제) · P2(후).
--    정의는 10-04 매출 하락 진단과 같다(48h · P1/P2). 성숙 판정(d <= 오늘-2)은 앱이 한다.

CREATE TABLE IF NOT EXISTS admin_seen_markers (
  key        TEXT PRIMARY KEY,
  seen_until TIMESTAMPTZ NOT NULL,
  -- AGENTS.md: users(id) FK 는 CASCADE/SET NULL 필수
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_seen_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_seen_markers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE admin_seen_markers TO service_role;

CREATE OR REPLACE FUNCTION admin_pay_rate(p_since TIMESTAMPTZ, p_exclude UUID[])
RETURNS TABLE (d DATE, signups BIGINT, payers BIGINT, p1 BIGINT, p2 BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT id, created_at,
           (created_at AT TIME ZONE 'UTC' + INTERVAL '9 hours')::date AS d
    FROM users
    WHERE created_at >= p_since
      AND NOT (id = ANY (COALESCE(p_exclude, '{}'::uuid[])))
  ), fp AS (
    -- 가입 후 48시간 안의 첫 completed 결제
    SELECT u.id, min(p.created_at) AS first_pay
    FROM u
    JOIN payments p ON p.user_id = u.id
    WHERE p.status = 'completed'
      AND p.created_at < u.created_at + INTERVAL '48 hours'
    GROUP BY u.id
  ), fr AS (
    SELECT r.user_id, min(r.created_at) AS first_reading
    FROM readings r
    JOIN u ON u.id = r.user_id
    GROUP BY r.user_id
  )
  SELECT u.d,
         count(*)::BIGINT,
         count(fp.id)::BIGINT,
         -- 🔴 NULL 3값 논리: 리딩이 없는 결제자는 P1 이다 — IS NULL 을 명시하지 않으면 사라진다
         count(fp.id) FILTER (WHERE fr.first_reading IS NULL OR fp.first_pay < fr.first_reading)::BIGINT,
         count(fp.id) FILTER (WHERE fr.first_reading IS NOT NULL AND fp.first_pay >= fr.first_reading)::BIGINT
  FROM u
  LEFT JOIN fp ON fp.id = u.id
  LEFT JOIN fr ON fr.user_id = u.id
  GROUP BY u.d
  ORDER BY u.d;
$$;

-- AGENTS.md: 새 SECURITY DEFINER RPC 는 셋 다 REVOKE.
REVOKE EXECUTE ON FUNCTION admin_pay_rate(TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_pay_rate(TIMESTAMPTZ, UUID[]) TO service_role;
