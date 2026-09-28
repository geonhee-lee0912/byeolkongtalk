-- 20260914000000_byeolmaru_pair_narrative.sql — 별마루 유료 "우리 오늘" 서술 캐시(유저·상대·날짜당 1행).
-- byeolmaru_daily_report(20260907000000)의 캐시 패턴을 그대로 미러한다. 근거는 원가가 아니라(회당 ₩1
-- 수준) ①일관성 — 같은 날 같은 상대인데 칩을 다시 누를 때마다 서술이 바뀌면 운세 앱의 신뢰가 깨진다
-- ②속도 — 생성 실측 5.1초(P5-5 로 분량이 2배가 되면 더 길다). 스펙 §8.
CREATE TABLE IF NOT EXISTS byeolmaru_pair_narrative (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  narrative_date DATE NOT NULL,
  narrative TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_profile_id, narrative_date)
);
CREATE INDEX IF NOT EXISTS idx_byeolmaru_pair_narrative_user
  ON byeolmaru_pair_narrative(user_id, narrative_date DESC);
ALTER TABLE byeolmaru_pair_narrative ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE byeolmaru_pair_narrative FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE byeolmaru_pair_narrative TO service_role;
