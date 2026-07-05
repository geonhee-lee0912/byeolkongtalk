-- 20260705000000_user_acquisition.sql — first-touch 유입 출처 (users 와 1:1, write-once)
CREATE TABLE IF NOT EXISTS user_acquisition (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_content     TEXT,
  utm_term        TEXT,
  fbclid          TEXT,
  fbc             TEXT,
  landing_variant TEXT,
  referrer        TEXT,
  first_seen_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 소재별 조회 가속
CREATE INDEX IF NOT EXISTS idx_user_acquisition_utm_content
  ON user_acquisition (utm_content);

-- RLS: service_role 만 R/W (클라 접근 없음)
ALTER TABLE user_acquisition ENABLE ROW LEVEL SECURITY;
