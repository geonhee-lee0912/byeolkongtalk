-- 20260905020000_byeolmaru_daily_card.sql — 별마루 오늘의 카드(하루 1행). 유저가 뽑은 원카드 고정.
-- 카드 데이터는 lib/tarot/cards.ts(78장) 정본, 이 테이블은 "그날 뽑은 카드" 링크뿐.
-- 스펙: docs/superpowers/specs/2026-09-05-별마루-5-원카드-폐지-낙수-design.md §2
CREATE TABLE IF NOT EXISTS byeolmaru_daily_card (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_date DATE NOT NULL,
  card_id INT NOT NULL,
  reversed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_date)
);
CREATE INDEX IF NOT EXISTS idx_byeolmaru_daily_card_user ON byeolmaru_daily_card(user_id, card_date DESC);
ALTER TABLE byeolmaru_daily_card ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE byeolmaru_daily_card FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE byeolmaru_daily_card TO service_role;
