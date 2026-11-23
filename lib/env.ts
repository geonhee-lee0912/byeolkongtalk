// 필수 환경변수 화이트리스트 + 누락 검사 헬퍼.
// /api/health 가 사용. 새 의존성(예: 토스/네이버페이) 추가 시 여기 한 줄 추가하면
// 전 환경에서 자동으로 검증됨.
//
// 14개 (Claude 1 + OpenAI 1 + 카카오 5 + Supabase 3 + Base URL 1 + Auth Secret 1 + 토스 2).
// OPENAI_API_KEY: chat(gpt-5.6-luna)·무료 데일리 운세(gpt-5-nano)가 의존 — 누락 시 상담·데일리
// 런타임 장애라 필수로 둔다(2026-08-14 모델 티어링 배포). 유료 리포트만 sonnet(CLAUDE_API_KEY).

export const REQUIRED_ENV = [
  "CLAUDE_API_KEY",
  "OPENAI_API_KEY",
  "KAKAO_CLIENT_ID",
  "KAKAO_CLIENT_SECRET",
  "KAKAO_REDIRECT_URI",
  "NEXT_PUBLIC_KAKAO_JS_KEY",
  "KAKAO_ADMIN_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_BASE_URL",
  "AUTH_TOKEN_SECRET",
  "NEXT_PUBLIC_TOSS_CLIENT_KEY",
  "TOSS_SECRET_KEY",
] as const;

export const OPTIONAL_ENV = [
  "NEXT_PUBLIC_GA_ID",
  "ADMIN_USER_IDS",
  "NAVER_SITE_VERIFICATION",
  "GOOGLE_SITE_VERIFICATION",
  "NEXT_PUBLIC_META_PIXEL_ID",
  "META_CAPI_ACCESS_TOKEN",
  "META_ADS_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "CRON_SECRET",
  // 보유 기간 만료 파기(app/api/cron/retention-purge) — 값이 "on" 일 때만 지운다. /api/health 는 '있다'만 본다(값은 못 본다)
  "RETENTION_PURGE",
  // 앱 ① 로그인(스펙 2026-10-12-앱-1 §10) — 없어도 웹 기존 기능은 돈다. /api/health 는 '있다'만 본다(길이·형식은 못 본다).
  // 앱 로그인 503: KAKAO_APP_ID(카카오)·APPLE_BUNDLE_ID(애플)·APP_ACCESS_TOKEN_SECRET(둘 다, 32자 이상). 웹 애플 로그인은 APPLE_SERVICES_ID 가 없으면 apple_not_configured.
  // APPLE_TEAM_ID·APPLE_KEY_ID·APPLE_PRIVATE_KEY(client_secret 서명)·APPLE_TOKEN_ENC_KEY(보관 암호화)가 없으면 애플 로그인은 되지만
  // 리프레시 토큰을 못 남겨(오류 로그 step apple_code_exchange) 탈퇴 때 애플 연결을 못 끊고, 이미 남긴 회원은 탈퇴가 503 이다
  "APP_ACCESS_TOKEN_SECRET",
  "KAKAO_APP_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "APPLE_BUNDLE_ID",
  "APPLE_SERVICES_ID",
  "APPLE_TOKEN_ENC_KEY",
  // 앱 결제(스펙 2026-11-23-앱-결제 §7) — 없어도 웹·토스 결제는 돈다. 확인 라우트 503 iap_not_configured: 애플 4개(iOS)·GOOGLE_PLAY_SERVICE_ACCOUNT(안드로이드) 중 그 플랫폼 것만.
  // APPLE_APP_ID 는 앱의 숫자 ID(운영 거래 서명 검증에 필수), GOOGLE_PLAY_SERVICE_ACCOUNT 는 서비스 계정 JSON 전체. PUBSUB 2개는 구글 환불 알림 인증
  "APPLE_IAP_KEY_ID",
  "APPLE_IAP_ISSUER_ID",
  "APPLE_IAP_PRIVATE_KEY",
  "APPLE_APP_ID",
  "GOOGLE_PLAY_SERVICE_ACCOUNT",
  "GOOGLE_PUBSUB_PUSH_EMAIL",
  "GOOGLE_PUBSUB_AUDIENCE",
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV)[number];

export function missingRequired(): RequiredEnvKey[] {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}

export function optionalPresence(): Record<string, boolean> {
  return OPTIONAL_ENV.reduce<Record<string, boolean>>((acc, k) => {
    acc[k] = Boolean(process.env[k]);
    return acc;
  }, {});
}
