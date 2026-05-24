-- 20260525000001_verify_integration.sql
-- GitHub 연동 양방향 검증 — baseline 이후 timestamp 로 실제 DDL 적용 확인
-- 검증 후 다음 마이그레이션에서 DROP

CREATE TABLE IF NOT EXISTS public._integration_check (
  id          SERIAL PRIMARY KEY,
  note        TEXT NOT NULL DEFAULT 'integration verified',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public._integration_check (note)
VALUES ('first row from byeolkongtalk dev');
