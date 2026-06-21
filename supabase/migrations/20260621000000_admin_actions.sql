-- 20260621000000_admin_actions.sql — 어드민 write 액션 감사 로그
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,        -- 'star_adjust' | 'payment_refund' | 'reading_delete' | 'sensitive_review' | 'error_resolve' | 'fortune_grant'
  target_type TEXT NOT NULL,   -- 'user' | 'payment' | 'reading' | 'sensitive_alert' | 'error_log'
  target_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created
  ON admin_actions(created_at DESC);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
