// 웹이 앱(React Native 웹뷰) 안에서 열렸는지 판단하고 앱에 메시지를 보낸다(브라우저 전용). 스펙 2026-10-12-앱-1 §5·§6.
// 1차 근거 = 앱이 문서 시작 전에 주입한 window.__BYEOLKONG_APP__, 2차 = UA 의 ByeolkongApp/ 표식(서버는 parseAppUserAgent 로 UA 만 본다).
import {
  encodeWebToApp,
  encodeWebToAppWith,
  hasCap,
  isAppInfo,
  parseAppUserAgent,
  type AppInfo,
  type HapticKind,
  type PlainWebToAppType,
} from "./app-bridge/protocol.ts";

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

/** 앱에 메시지 — 앱 밖(브라우저)에선 아무것도 안 한다. 앱 쪽 연결이 던져도 던지지 않는다 */
export function postToApp(type: PlainWebToAppType): void {
  if (typeof window === "undefined") return;
  try {
    (window as AppWindow).ReactNativeWebView?.postMessage(encodeWebToApp(type));
  } catch {
    // 앱 쪽 연결이 끊긴 순간(웹뷰 해체 중 등) — 닿지 못한 알림은 되살릴 방법이 없다. 그래도 부르는 쪽(마이페이지 로그아웃·탈퇴)의
    // 저장소 정리(고민 원문 삭제 포함)·이동은 이 호출 뒤에 있으니, 여기서 던져 그걸 막지 않는다
  }
}

function postRaw(message: string): void {
  try {
    (window as AppWindow).ReactNativeWebView?.postMessage(message);
  } catch {
    /* 앱 쪽 연결이 끊긴 순간 — 진동·새로고침 요청은 놓쳐도 그만이다 */
  }
}

/** 진동 한 번(탭 전환·카드 뽑기 = light, 결제 완료 = success) — caps 에 ui 가 있는 앱에서만. 스펙 2026-11-07-앱-화면 §5 ⑥ */
export function appHaptic(kind: HapticKind): void {
  if (typeof window === "undefined" || !hasCap(getAppInfo(), "ui")) return;
  postRaw(encodeWebToAppWith("ui.haptic", { kind }));
}

/** 앱에 새로고침 요청(안드로이드 당겨서 새로고침) — caps 에 ui 가 있는 앱에서만. 스펙 §5 ④ */
export function appRefresh(): void {
  if (typeof window === "undefined" || !hasCap(getAppInfo(), "ui")) return;
  postRaw(encodeWebToApp("ui.refresh"));
}
