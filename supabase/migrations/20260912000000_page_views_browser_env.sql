-- page_views.browser_env (2026-09-12)
-- 배경: 광고 유입의 99.6% 가 인앱 브라우저(Meta 콘솔 '앱 내')인데, /login 화면까지 온 1,350명 중
--       416명(30.8%)이 카카오 로그인을 하지 않고 이탈한다. error_logs 의 OAuth 실패는 3건뿐이라
--       기술 장애가 아니라 진입 마찰로 보이지만, 비교군이 없어 판별이 불가능했다.
-- 값: 'ig' | 'fb' | 'kakao' | 'other_inapp' | 'browser' | NULL(UA 없음 — 추측하지 않는다)
-- ⚠️ 인앱을 하나로 뭉치지 않는 이유: 카카오톡 인앱은 카카오 로그인이 네이티브로 붙는 최선 케이스고
--    인스타 인앱이 최악이다. 합치면 비교군이 사라져 판별 목적 자체가 무너진다.
-- 판별 로직 정본 = lib/analytics/pageview.ts 의 detectBrowserEnv (계약은 pageview.test.ts).

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS browser_env TEXT;
