// 애플 로그인 버튼 노출 규칙 — 웹 브라우저는 스위치(APPLE_LOGIN_WEB), iOS 앱은 늘 보임, 안드로이드 앱은 늘 숨김.
// 애플 지침 4.8 은 iOS 앱에만 걸리고, 안드로이드엔 네이티브 애플 로그인이 없다(스펙 2026-10-12-앱-1 §6). 순수 함수.
import type { AppInfo } from "../app-bridge/protocol.ts";

/** 웹 스위치 — 🔴 10-23 12:36·10-25 21:29 판정 전에는 prod 웹 화면을 바꾸지 않는다(스펙 §13). 상수라 바꾸면 재배포(prod 는 사용자 go).
 *  apple-login-flag.test.ts 의 "기본 스위치 = 꺼짐" 테스트는 일부러 걸리게 해 뒀다 — 켤 때 그 테스트도 같이 고칠 것 */
export const APPLE_LOGIN_WEB = false;

export function showAppleLogin(app: AppInfo | null, webSwitch: boolean = APPLE_LOGIN_WEB): boolean {
  if (app) return app.platform === "ios";
  return webSwitch;
}
