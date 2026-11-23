// 앱 결제(애플·구글) 확인 공통 — 스토어가 말해 준 거래 모양과 설정 확인. 스펙 2026-11-23-앱-결제 §3·§7.
import { appTokenSecretReady } from "@/lib/auth/app-token";

/** 애플 번들 ID = 구글 패키지 이름 — mobile/app.config.ts 의 운영 변형(APP_VARIANT=production). 개발용 변형(.dev)의 거래는 받지 않는다 */
export const IAP_APP_ID = "com.byeolkongtalk.app";

export type VerifiedPurchase = {
  store: "apple" | "google";
  productId: string;
  /** payments.pg_tid — apple:<transactionId> / google:<orderId>, 테스트 결제는 apple-sandbox: / google-test:. 구매 토큰은 넣지 않는다 */
  tid: string;
  /** 애플 Sandbox · 구글 라이선스 테스터(purchaseType 0) — 별은 주되 매출 0원(앱 심사자 구매) */
  sandbox: boolean;
  /** 앱이 결제 때 실은 계정 토큰(애플 appAccountToken · 구글 obfuscatedAccountId) — 소문자. 스토어가 안 실어 주면 null */
  accountToken: string | null;
  /** 환불·취소된 거래 */
  revoked: boolean;
  /** 구글 대기 결제(현금 결제 등) — 아직 돈이 안 들어옴 */
  pending: boolean;
};

/** 그 플랫폼의 서버 비밀값이 다 있나 — 없으면 라우트가 503 iap_not_configured. 계정 토큰 서명값(APP_ACCESS_TOKEN_SECRET)은 둘 다 필요 */
export function iapConfigured(platform: "ios" | "android"): boolean {
  if (!appTokenSecretReady()) return false;
  const e = process.env;
  if (platform === "ios") return !!(e.APPLE_IAP_KEY_ID && e.APPLE_IAP_ISSUER_ID && e.APPLE_IAP_PRIVATE_KEY && e.APPLE_APP_ID);
  return !!e.GOOGLE_PLAY_SERVICE_ACCOUNT;
}

/** 환불 알림 라우트의 서버 비밀값 — 없으면 503. 애플은 알림 서명 검증(운영 검증기)에 앱 숫자 ID, 구글은 푸시 인증의 서비스 계정 이메일·대상 */
export function iapNotifyConfigured(store: "apple" | "google"): boolean {
  const e = process.env;
  if (store === "apple") return !!e.APPLE_APP_ID;
  return !!(e.GOOGLE_PUBSUB_PUSH_EMAIL && e.GOOGLE_PUBSUB_AUDIENCE);
}
