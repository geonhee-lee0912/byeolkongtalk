-- 20261010030000_user_acquisition_capture_source.sql
-- user_acquisition 이 어떤 경로로 잡혔는지 기록 (인스타 인앱브라우저에서 JS 쿠키가 로그인 왕복 중 유실되는 ~8% 추적용).
-- 값:
--   'client'   : 클라 JS(AuthBootstrap)가 쓴 byeolkong_acq 쿠키 (기존 경로)
--   'server'   : proxy.ts 가 Set-Cookie 로 심은 byeolkong_acq 쿠키
--   'pageview' : 가입 시 쿠키가 없어 page_views(같은 anon_id, 비로그인)에서 복구
--   'backfill' : 일회성 SQL 백필(scripts/backfill-user-acquisition-from-pageviews.sql)
--   NULL       : 이 마이그레이션 이전 행
ALTER TABLE user_acquisition ADD COLUMN IF NOT EXISTS capture_source TEXT;
