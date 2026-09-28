-- 20260919000000_byeolmaru_card_narrative.sql — 별마루 유료 "오늘 타로" 해석 캐시(유저·날짜당 1행).
-- byeolmaru_pair_narrative(20260914000000) 패턴을 그대로 미러한다. 근거는 원가가 아니라
-- ①일관성 — 같은 날 다시 들어왔는데 카드 해석이 바뀌면 운세 앱의 신뢰가 깨진다(pair 캐시와 같은 사유인데
-- card 에만 빠져 있었다) ②속도 — 생성 실측 6.5초. 스펙 §7-4.
-- 하루 1장 고정이라 카드 id 를 키에 넣지 않는다(byeolmaru_daily_card 가 그날 카드의 단일 원천).
CREATE TABLE IF NOT EXISTS byeolmaru_card_narrative (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  narrative_date DATE NOT NULL,
  narrative TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, narrative_date)
);
CREATE INDEX IF NOT EXISTS idx_byeolmaru_card_narrative_user
  ON byeolmaru_card_narrative(user_id, narrative_date DESC);
ALTER TABLE byeolmaru_card_narrative ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE byeolmaru_card_narrative FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE byeolmaru_card_narrative TO service_role;
