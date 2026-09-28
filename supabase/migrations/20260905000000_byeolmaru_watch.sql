-- 20260905000000_byeolmaru_watch.sql — 별마루 "우리 오늘" 지켜보는 상대(얇은 링크).
-- 인물 데이터는 user_profiles(단일 원천), 이 테이블은 "이 상대를 우리 오늘에서 본다"는 링크뿐.
-- 스펙: docs/superpowers/specs/2026-09-05-별마루-3-우리오늘-design.md §5
CREATE TABLE IF NOT EXISTS byeolmaru_watch (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_byeolmaru_watch_user ON byeolmaru_watch(user_id, created_at ASC);

ALTER TABLE byeolmaru_watch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE byeolmaru_watch FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE byeolmaru_watch TO service_role;
