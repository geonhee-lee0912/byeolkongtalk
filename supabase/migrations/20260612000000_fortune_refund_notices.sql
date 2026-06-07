-- 20260612000000_fortune_refund_notices.sql — 운세 리포트 생성 실패 환불 알림
--
-- 운세 리포트는 백그라운드(after)에서 생성된다. 생성·파싱 실패 시 빈 리딩을
-- 삭제하고 별을 자동 환불하는데(failGeneration), 이때 리딩이 통째로 사라져
-- 사용자는 "결제했는데 아무것도 안 보이고 별만 환불됨" 상태를 알 길이 없었다.
-- 이 테이블에 환불 사실을 남겨 /fortune 상단에 카드로 노출하고,
-- 사용자가 '확인'을 누르면(acknowledged_at) 다시 띄우지 않는다.

CREATE TABLE IF NOT EXISTS fortune_refund_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emotion_tag VARCHAR(40),          -- 운세 종류 센티넬 (라벨·아이콘 복원용)
  refunded_stars INTEGER NOT NULL,  -- 환불한 별 수

  acknowledged_at TIMESTAMPTZ       -- 사용자가 확인 누른 시각 (NULL = 미확인)
);

CREATE INDEX IF NOT EXISTS idx_fortune_refund_unacked
  ON fortune_refund_notices(user_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- service_role 만 접근 (API 라우트에서 세션 user_id 로 필터). 정책 없음 = anon/authenticated 차단.
ALTER TABLE fortune_refund_notices ENABLE ROW LEVEL SECURITY;
