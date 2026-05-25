-- 20260601000000_error_logs.sql — 자체 에러 로거 인프라
-- v1 (tarot-friend) 의 003_error_logs.sql 이식. Sentry 대신 Supabase 에 직접 적재.
-- Phase 4 (b) auth 이식 시 users 테이블 생성 후 ALTER 로 user_id FK 추가 예정.

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 분류
  level VARCHAR(10) NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn', 'info')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('server', 'client', 'edge')),

  -- 핵심 정보
  message TEXT NOT NULL,
  stack TEXT,

  -- 컨텍스트
  route TEXT,                 -- API route 또는 page path
  user_id UUID,               -- Phase 4 (b) 에서 users(id) FK 추가
  anonymous_id TEXT,          -- 비로그인 유저 추적
  user_agent TEXT,
  ip TEXT,

  -- fingerprint: 같은 에러 그룹화용 (message + stack 첫줄 해시)
  fingerprint VARCHAR(64),

  -- 자유 형식 추가 컨텍스트 (request body, params 등)
  context JSONB,

  -- 운영 상태
  resolved_at TIMESTAMPTZ,
  resolved_by UUID            -- Phase 4 (b) 에서 users(id) FK 추가
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON error_logs(resolved_at, created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- RLS: service_role 만 접근. 일반 클라는 /api/log/error 엔드포인트 경유
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
