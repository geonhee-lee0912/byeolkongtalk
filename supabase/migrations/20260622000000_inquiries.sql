-- 20260622000000_inquiries.sql — 고객센터 1:1 문의 (사용자 질문 + 어드민 답변, 1Q→1A)
CREATE TABLE IF NOT EXISTS inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,        -- 'bug'|'refund'|'suggestion'|'usage'|'etc'
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'answered'
  answer_body TEXT,                 -- 어드민 답변 (null = 미답변)
  answered_at TIMESTAMPTZ,
  answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  read_at     TIMESTAMPTZ,          -- 사용자가 답변을 확인한 시각 (배지 해제용)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_user   ON inquiries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status, created_at DESC);

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
-- RLS 정책 미추가: 기존 테이블(sensitive_alerts/admin_actions)과 동일하게 service_role 로만 접근.
