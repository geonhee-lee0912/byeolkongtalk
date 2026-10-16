// 웹이 앱(React Native 웹뷰) 안에서 열렸는지 판단하고 앱에 메시지를 보낸다(브라우저 전용). 스펙 2026-10-12-앱-1 §5·§6.
// 1차 근거 = 앱이 문서 시작 전에 주입한 window.__BYEOLKONG_APP__, 2차 = UA 의 ByeolkongApp/ 표식(서버는 parseAppUserAgent 로 UA 만 본다).
import { encodeWebToApp, isAppInfo, parseAppUserAgent, type AppInfo, type WebToAppType } from "./app-bridge/protocol.ts";

type AppWindow = Window & {
  __BYEOLKONG_APP__?: unknown;
  ReactNativeWebView?: { postMessage(message: string): void };
};

/** 앱 안이면 앱 정보, 브라우저면 null. 서버 렌더 중엔 늘 null — 화면 분기는 lib/use-app-info.ts(마운트 뒤)로 */
export function getAppInfo(): AppInfo | null {
  if (typeof window === "undefined") return null;
  const injected = (window as AppWindow).__BYEOLKONG_APP__;
  if (isAppInfo(injected)) return injected;
  return parseAppUserAgent(navigator.userAgent);
}

/** 앱에 메시지 — 앱 밖(브라우저)에선 아무것도 안 한다 */
export function postToApp(type: WebToAppType): void {
  if (typeof window === "undefined") return;
  (window as AppWindow).ReactNativeWebView?.postMessage(encodeWebToApp(type));
}
