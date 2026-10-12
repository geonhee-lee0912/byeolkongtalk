-- 앱 ① 로그인 — 로그인 수단(카카오·애플) 일반화 + 앱 리프레시 토큰 + 웹뷰 교환 코드
-- 스펙: docs/superpowers/specs/2026-10-12-앱-1-껍데기-로그인-design.md §8
-- 규칙: RLS 켜고 정책 없음(service_role 만) · users FK 는 전부 ON DELETE CASCADE · SECURITY DEFINER 함수 없음

-- 1) 로그인 수단 — 회원 1명에 카카오·애플(나중엔 다른 수단)을 붙인다
CREATE TABLE IF NOT EXISTS user_identities (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL CHECK (provider IN ('kakao', 'apple')),
  provider_user_id        TEXT NOT NULL,              -- 카카오 회원번호(문자열) / 애플 sub
  apple_client_id         TEXT,                       -- 애플 토큰을 발급한 client_id(번들 ID 또는 Services ID) — revoke 때 필요
  apple_refresh_token_enc TEXT,                       -- 애플 리프레시 토큰(AES-256-GCM, lib/auth/token-crypto.ts)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at           TIMESTAMPTZ,
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

-- 기존 카카오 회원을 옮겨 담는다.
-- 이 마이그레이션과 새 코드 배포 사이에 옛 코드로 가입한 사람은 lib/auth/sign-in.ts 가 다음 로그인 때 자가 치유하고,
-- 그 전까지 조회는 lib/auth/user-identity.ts 가 users.kakao_id 로 보충한다. users.kakao_id 칸을 지우기 전엔 이 INSERT 를 한 번 더 돌릴 것.
INSERT INTO user_identities (user_id, provider, provider_user_id, created_at)
SELECT id, 'kakao', kakao_id::text, created_at
FROM users
WHERE kakao_id IS NOT NULL
ON CONFLICT (provider, provider_user_id) DO NOTHING;

-- 2) 애플 회원은 카카오 회원번호가 없다. UNIQUE 는 유지한다(카카오 회원 중복 방지 — 전환기 동안 계속 채운다)
ALTER TABLE users ALTER COLUMN kakao_id DROP NOT NULL;

-- 3) 앱 리프레시 토큰 — 원본은 기기에만, 여기엔 sha256 해시만
CREATE TABLE IF NOT EXISTS app_refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   UUID NOT NULL,                          -- 기기 로그인 1회 = 묶음 1개(교체돼도 같은 묶음)
  token_hash  TEXT NOT NULL UNIQUE,
  platform    TEXT CHECK (platform IN ('ios', 'android')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  rotated_at  TIMESTAMPTZ,                            -- 새 토큰으로 교체된 시각(이 토큰이 다시 오면 재사용 감지 → 묶음 폐기)
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_user ON app_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_family ON app_refresh_tokens(family_id);
ALTER TABLE app_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- 4) 웹뷰 교환 코드 — 60초 · 1회용
CREATE TABLE IF NOT EXISTS app_handoff_codes (
  code_hash   TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_new_user BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_handoff_codes_user ON app_handoff_codes(user_id);
ALTER TABLE app_handoff_codes ENABLE ROW LEVEL SECURITY;

-- 5) 해시 칸의 뜻이 넓어졌다. 칸 이름은 배포 순서 사고를 피하려고 그대로 둔다
COMMENT ON COLUMN bonus_claims.kakao_id_hash IS '로그인 수단 해시(sha256 hex) — 카카오: sha256(카카오 회원번호 문자열), 애플: sha256(''apple:''||sub). 정본 lib/auth/identity-hash.ts';
COMMENT ON COLUMN account_withdrawals.kakao_id_hash IS '로그인 수단 해시(sha256 hex) — 카카오: sha256(카카오 회원번호 문자열), 애플: sha256(''apple:''||sub). 정본 lib/auth/identity-hash.ts';

-- 6) 기본 권한은 이미 닫혀 있지만(2026-07-29) 이중 방어 — 저장소 관례대로 PUBLIC 까지 셋 다
REVOKE ALL ON TABLE user_identities, app_refresh_tokens, app_handoff_codes FROM PUBLIC, anon, authenticated;
