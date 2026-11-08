// 겹창 스택 ↔ 앱 — 앱이 caps 에 ui 를 실었을 때만 붙는다(옛 앱엔 아무것도 보내지 않는다).
// 열림·닫힘을 ui.overlay 로 미리 알린다: 앱의 안드로이드 뒤로 버튼(BackHandler)은 바로 답해야 해서 웹에 물어볼 수 없다.
// 앱이 ui.back 을 보내면 맨 위 창을 닫는다(닫을 수 없는 창이면 소비만). 스펙 2026-11-07-앱-화면 §7·§8
import { APP_EVENT, encodeWebToAppWith, hasCap, parseAppToWeb, type AppInfo } from "../app-bridge/protocol.ts";

export type BridgeWindow = {
  ReactNativeWebView?: { postMessage(message: string): void };
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
};
type Stack = { size(): number; closeTop(): boolean; subscribe(fn: (open: boolean) => void): () => void };

export function installOverlayBridge(win: BridgeWindow, stack: Stack, app: AppInfo | null): () => void {
  if (!hasCap(app, "ui")) return () => {};
  const send = (open: boolean) => {
    try {
      win.ReactNativeWebView?.postMessage(encodeWebToAppWith("ui.overlay", { open }));
    } catch {
      /* 앱 연결이 끊긴 순간 — 다음 알림 때 다시 맞는다 */
    }
  };
  const onEvent = (e: Event) => {
    if (parseAppToWeb((e as CustomEvent).detail)?.type === "ui.back") stack.closeTop();
  };
  if (stack.size() > 0) send(true); // 다리가 늦게 붙었는데 이미 열려 있다
  const off = stack.subscribe(send);
  win.addEventListener(APP_EVENT, onEvent);
  return () => {
    off();
    win.removeEventListener(APP_EVENT, onEvent);
  };
}
