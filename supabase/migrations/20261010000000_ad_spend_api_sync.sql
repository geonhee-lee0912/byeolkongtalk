-- 20261010000000_ad_spend_api_sync.sql — 광고비 Meta API 자동 수집
-- 설계: docs/superpowers/specs/2026-10-10-광고비-API-자동수집-design.md
--
-- 1) ad_sync_runs — 동기화 실행 기록. /admin/ads 의 "마지막 동기화" 줄의 원천.
-- 2) admin_ad_spend_replace_days — 지정 날짜들의 Meta 행을 한 트랜잭션에서 지우고 다시 넣는다.
--    왜 통째 교체인가: CSV 시절 adset 칸에 예산 금액이 들어가 예산이 바뀌면 같은 광고가 다른 키로
--    갈라졌고(10-04 bm_v1 ₩1,462 이중 집계, API 대조로 확정), 일부분 업로드가 그대로 남았다.
--    upsert 로는 사라진 키의 찌꺼기가 지워지지 않는다.
--    ⚠️ 그 날짜의 platform='meta' 행은 수동 입력분까지 전부 교체된다(의도). 비-Meta 행은 건드리지 않는다.

CREATE TABLE IF NOT EXISTS ad_sync_runs (
  id           BIGSERIAL PRIMARY KEY,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  trigger      TEXT NOT NULL CHECK (trigger IN ('cron', 'manual', 'range')),
  date_from    DATE NOT NULL,
  date_to      DATE NOT NULL,
  rows_written INTEGER,
  ok           BOOLEAN,
  error        TEXT,
  -- AGENTS.md: users(id) FK 는 CASCADE/SET NULL 필수 (없으면 회원 탈퇴가 23503 으로 막힌다)
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_sync_runs_started ON ad_sync_runs (started_at DESC);

-- 기본 권한이 닫혀 있지만(2026-07-29) 명시 REVOKE 를 이중 방어로 유지한다.
ALTER TABLE ad_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ad_sync_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE ad_sync_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ad_sync_runs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION admin_ad_spend_replace_days(p_dates DATE[], p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  -- cron 과 버튼이 겹쳐 두 번 동시에 돌면, 뒤 트랜잭션의 DELETE 는 앞이 새로 넣은 행을 못 보고
  -- INSERT 에서 UNIQUE 위반으로 죽는다. 트랜잭션 단위 advisory lock 으로 줄 세운다.
  PERFORM pg_advisory_xact_lock(hashtext('admin_ad_spend_replace_days'));

  IF p_dates IS NULL OR cardinality(p_dates) = 0 THEN
    RAISE EXCEPTION 'p_dates is empty';
  END IF;
  -- 교체 범위 밖 날짜를 쓰면 그 날의 기존 행과 섞여 이중 집계가 된다 — 거부한다.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
    WHERE (r->>'spend_date')::date IS NULL
       OR NOT ((r->>'spend_date')::date = ANY (p_dates))
  ) THEN
    RAISE EXCEPTION 'row spend_date outside p_dates';
  END IF;

  DELETE FROM ad_spend WHERE platform = 'meta' AND spend_date = ANY (p_dates);

  INSERT INTO ad_spend
    (spend_date, platform, campaign, adset, creative_key,
     impressions, clicks, spend_won, reach, note, created_by)
  SELECT (r->>'spend_date')::date,
         'meta',
         COALESCE(r->>'campaign', ''),
         COALESCE(r->>'adset', ''),
         COALESCE(r->>'creative_key', ''),
         (r->>'impressions')::int,
         (r->>'clicks')::int,
         (r->>'spend_won')::int,
         (r->>'reach')::int,
         r->>'note',
         NULLIF(r->>'created_by', '')::uuid
  FROM jsonb_array_elements(p_rows) r;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- AGENTS.md: 새 SECURITY DEFINER RPC 는 셋 다 REVOKE.
REVOKE EXECUTE ON FUNCTION admin_ad_spend_replace_days(DATE[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_ad_spend_replace_days(DATE[], JSONB) TO service_role;
