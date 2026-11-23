// 앱 로그인 실패 기록 — 알림은 '로그인이 안 됐어' 한 줄뿐이라 사유가 어디에도 안 남는다. /api/log/error 로 보낼 본문을 만든다.
// 네이티브 SDK 문구엔 토큰이 없지만 길이는 자른다. 순수 모듈 — react-native import 금지(루트 CI 가 돌린다).

const MAX_REASON = 300;

export type LoginProvider = "kakao" | "apple";

export function loginFailureLog(provider: LoginProvider, platform: string, e: unknown) {
  const { code, status, message } = (e ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  const reason = typeof message === "string" && message ? message : String(e);
  return {
    level: "warn",
    message: `app_login_failed ${provider}: ${reason}`.slice(0, MAX_REASON),
    fingerprint: `app_login_failed_${provider}`,
    route: `app:login:${provider}`,
    context: {
      platform,
      code: typeof code === "string" ? code : null,
      status: typeof status === "number" ? status : null,
    },
  };
}
