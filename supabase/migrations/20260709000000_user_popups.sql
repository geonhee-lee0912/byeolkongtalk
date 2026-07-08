-- 20260709000000_user_popups.sql — 어드민 발 1회성 안내 팝업 (개별 + 전체 발송)
-- popups: 팝업 본체. target_user_id NULL = 전체 발송, 값 있으면 개별 발송.
-- popup_acks: 유저별 확인 기록. "확인" 누른 유저에게는 다시 노출 안 함.
CREATE TABLE IF NOT EXISTS popups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = 전체 발송
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS popup_acks (
  popup_id        UUID NOT NULL REFERENCES popups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (popup_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_popups_target ON popups(target_user_id, created_at);

ALTER TABLE popups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE popup_acks ENABLE ROW LEVEL SECURITY;
-- RLS 정책 미추가: 기존 테이블(inquiries/admin_actions 등)과 동일하게 service_role 로만 접근.
