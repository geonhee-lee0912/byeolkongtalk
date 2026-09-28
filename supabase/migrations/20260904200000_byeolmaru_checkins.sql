-- 20260904200000_byeolmaru_checkins.sql — 별마루 출석(하루 1행). 습관 스트릭(전 유저) + 구독 보상 카운트.
-- 스펙: docs/superpowers/specs/2026-09-04-별마루-2-구독게이트-design.md §6·§8
CREATE TABLE IF NOT EXISTS byeolmaru_checkins (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, checkin_date)
);
CREATE INDEX IF NOT EXISTS idx_byeolmaru_checkins_user ON byeolmaru_checkins(user_id, checkin_date DESC);

ALTER TABLE byeolmaru_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE byeolmaru_checkins FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE byeolmaru_checkins TO service_role;
