-- 20260609000000_saju_products.sql — 사주 4종 상품
-- readings.saju_product: 어떤 사주 상품으로 시작된 풀이인지.
-- 기존 행은 today_letters(기존 별콩이 사주 대체)로 백필.

ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS saju_product TEXT NOT NULL DEFAULT 'today_letters'
  CHECK (saju_product IN ('today_letters', 'nature', 'choice', 'good_days'));
