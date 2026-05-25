-- 20260603000000_users.sql — Phase 4 (b) 카카오 OAuth 유저 테이블
-- v1 (tarot-friend) data/schema.sql 의 users 테이블 이식.
-- 사주 도메인 컬럼(생일/음력 등) 은 Phase 5 에서 ALTER 로 추가 예정.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kakao_id BIGINT UNIQUE NOT NULL,
  nickname VARCHAR(50) NOT NULL,
  profile_img VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service_role 만 R/W. 클라는 /api/auth/me 경유.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- error_logs.user_id 가 Phase 4 (a) 시점엔 FK 없이 UUID 컬럼만 있었음.
-- 이제 users 테이블 생겼으니 FK 연결 (ON DELETE SET NULL — 탈퇴해도 로그는 유지)
ALTER TABLE error_logs
  ADD CONSTRAINT error_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE error_logs
  ADD CONSTRAINT error_logs_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
