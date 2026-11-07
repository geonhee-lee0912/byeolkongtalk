// 웹이 앱에 OS 알림 권한을 묻고(push.status) 요청하고(push.request) 앱의 답(APP_EVENT)을 기다린다(브라우저 전용).
// 요청 id 가 없는 프로토콜이라, 겹쳐 부르면 각 호출이 "다음 유효한 답" 하나씩을 받는다 — 한 번에 하나만 부르는 게 전제.
import { getAppInfo } from "./app-context.ts";
import { APP_EVENT, encodeWebToApp, hasCap, parseAppToWeb, type PushState } from "./app-bridge/protocol.ts";

type BridgeWindow = Window & { ReactNativeWebView?: { postMessage(message: string): void } };

// status 는 앱이 바로 답한다. request 는 사용자가 OS 창을 보는 동안이라 길게
const DEFAULT_TIMEOUT_MS = { "push.status": 3_000, "push.request": 60_000 } as const;

/** 앱이면 OS 알림 권한 상태, 시간 초과·앱 밖이면 null */
export function askAppPush(
  type: "push.status" | "push.request",
  opts: { timeoutMs?: number; win?: Window } = {},
): Promise<PushState | null> {
  const win = (opts.win ?? (typeof window === "undefined" ? undefined : window)) as BridgeWindow | undefined;
  const bridge = win?.ReactNativeWebView;
  if (!win || !bridge) return Promise.resolve(null);

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (state: PushState | null) => {
      win.removeEventListener(APP_EVENT, onEvent);
      clearTimeout(timer);
      resolve(state);
    };
    const onEvent = (e: Event) => {
      const msg = parseAppToWeb((e as CustomEvent).detail);
      if (msg) finish(msg.state);
    };
    // 답이 동기로 올 수도 있어 리스너를 먼저 건다
    win.addEventListener(APP_EVENT, onEvent);
    timer = setTimeout(() => finish(null), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS[type]);
    try {
      bridge.postMessage(encodeWebToApp(type));
    } catch {
      finish(null); // 앱 쪽 연결이 끊긴 순간 — 기다려도 답이 없다
    }
  });
}

export function appSupportsPush(): boolean {
  return hasCap(getAppInfo(), "push");
}
