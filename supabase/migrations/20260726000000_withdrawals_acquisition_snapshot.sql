-- 20260726000000_withdrawals_acquisition_snapshot.sql — 탈퇴 시 유입 출처 스냅샷 (additive)
-- 배경: users CASCADE 로 user_acquisition 이 함께 삭제돼 소재별 탈퇴/코호트 계측이 소실
-- (2026-07-25 P&L §리스크 5). 탈퇴 직전 user_acquisition 을 복사해 append-only 원장에 보존.
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_source      TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_medium      TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_campaign    TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_content     TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS utm_term        TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS landing_variant TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS referrer        TEXT;
ALTER TABLE account_withdrawals ADD COLUMN IF NOT EXISTS first_seen_at   TIMESTAMPTZ;
