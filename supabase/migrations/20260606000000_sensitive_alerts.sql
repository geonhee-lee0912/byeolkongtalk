-- 20260606000000_sensitive_alerts.sql — Phase 5 (e) / Phase 4 (e) 위기 시그널 안전망
-- v1 (tarot-friend) 006_sensitive_alerts.sql 이식.
--
-- 사용자 메시지 진입 시 lib/sensitive 가 regex 1차 + Claude haiku 2차 분류 →
-- 매칭되면 이 테이블에 INSERT + readings.has_sensitive=true 마킹 + 응답 헤더로
-- 클라이언트에 알림 → SafetyBanner 노출.

CREATE TABLE IF NOT EXISTS sensitive_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  reading_id UUID REFERENCES readings(id) ON DELETE SET NULL,
  message_text TEXT,            -- 매칭된 사용자 메시지 (최대 500자, 일부 잘림)

  category VARCHAR(30) NOT NULL CHECK (category IN (
    'suicide',             -- 자살 / 자해
    'school_violence',     -- 학교폭력 / 따돌림
    'domestic_violence',   -- 가정폭력 / 아동학대
    'sexual_violence',     -- 성폭력 / 성희롱
    'substance_abuse',     -- 약물 / 알코올 의존
    'other'                -- 기타 위기
  )),
  severity SMALLINT NOT NULL CHECK (severity IN (1, 2, 3)),
    -- 1: 주의 (모호한 시그널)
    -- 2: 경고 (분명한 위기 시그널)
    -- 3: 긴급 (즉시 자해 위험 등)

  matched_keywords TEXT[],
  detection_method VARCHAR(20) NOT NULL DEFAULT 'regex'
    CHECK (detection_method IN ('regex', 'claude', 'both')),

  -- 검토 상태 (운영자가 /admin/sensitive 또는 SQL Editor 로 마킹 — Phase 4 d 까지는 수동)
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  action_taken VARCHAR(20)
    CHECK (action_taken IN ('no_action', 'contacted', 'forwarded', 'false_positive', NULL)),
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_sensitive_unreviewed
  ON sensitive_alerts(severity DESC, created_at DESC)
  WHERE reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sensitive_user
  ON sensitive_alerts(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sensitive_reading
  ON sensitive_alerts(reading_id) WHERE reading_id IS NOT NULL;

ALTER TABLE sensitive_alerts ENABLE ROW LEVEL SECURITY;
