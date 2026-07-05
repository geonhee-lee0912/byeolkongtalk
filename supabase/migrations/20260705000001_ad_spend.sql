-- 20260705000001_ad_spend.sql — 메타 광고 지출 수동입력 (선택 기능)
CREATE TABLE IF NOT EXISTS ad_spend (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date   DATE NOT NULL,
  platform     TEXT NOT NULL DEFAULT 'meta',
  campaign     TEXT NOT NULL DEFAULT '',
  adset        TEXT NOT NULL DEFAULT '',
  creative_key TEXT NOT NULL DEFAULT '',
  impressions  INTEGER,
  clicks       INTEGER,
  spend_won    INTEGER NOT NULL,
  reach        INTEGER,
  note         TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spend_date, platform, campaign, adset, creative_key)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_creative_key ON ad_spend (creative_key);

ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
