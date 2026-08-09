-- 정성 이탈조사 설문 응답 (2026-08-09)
-- 설계: docs/superpowers/specs/2026-08-09-survey-이탈조사-design.md
-- 잔존·재방문 유저 대상 자유서술 6문항. answers 는 [{q,a}] 배열(질문 텍스트 스냅샷)이라
-- 나중에 문항을 고쳐도 과거 응답 해석이 안 깨진다. ui_events 권한 패턴 복제.

CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,

  -- 🔴 users(id) 참조 FK 는 CASCADE/SET NULL 을 반드시 명시(AGENTS.md).
  --    없으면 회원 탈퇴 users DELETE 가 23503 으로 막힌다. 탈퇴해도 정성 응답은 익명 보존.
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anon_id TEXT,
  answers JSONB NOT NULL,   -- [{ "q": "질문 텍스트", "a": "답변" }, ...]

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1인 1회. user_id NULL(탈퇴 익명행)은 중복 허용해야 하므로 partial unique.
CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_user_id_key
  ON survey_responses(user_id) WHERE user_id IS NOT NULL;

-- 어드민 최신순 조회
CREATE INDEX IF NOT EXISTS idx_survey_responses_created
  ON survey_responses(created_at DESC);

-- RLS: service_role 만. 클라는 /api/survey 경유 (ui_events·page_views 관행).
-- 2026-07-29 기본권한 정리로 새 테이블은 RLS 를 깜빡해도 anon 이 못 만지지만 이중 방어.
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE survey_responses FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE survey_responses TO service_role;
GRANT USAGE, SELECT ON SEQUENCE survey_responses_id_seq TO service_role;
