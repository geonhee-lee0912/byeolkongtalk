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
