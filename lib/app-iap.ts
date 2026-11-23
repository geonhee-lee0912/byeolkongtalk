// 웹이 앱에 스토어 가격을 묻고(iap.products) 구매를 부탁하고(iap.buy) 앱의 답(APP_EVENT)을 기다린다(브라우저 전용). 스펙 2026-11-23-앱-결제 §5.
// 서버 확인(POST /api/payment/iap)은 앱이 한다 — 웹은 결과만 받는다. 구매는 한 번에 하나(진행 중이면 같은 약속).
import { APP_EVENT, encodeWebToAppWith, parseAppToWeb, type IapResult } from "./app-bridge/protocol.ts";

type BridgeWindow = Window & { ReactNativeWebView?: { postMessage(message: string): void } };

function bridgeWindow(win?: Window): BridgeWindow | undefined {
  return (win ?? (typeof window === "undefined" ? undefined : window)) as BridgeWindow | undefined;
}

/** 앱에 메시지를 보내고 고른 답 하나를 기다린다. 앱 밖·연결 끊김은 바로 fallback, 시간 초과도 fallback */
function ask<T>(win: BridgeWindow | undefined, message: string, pick: (detail: unknown) => T | undefined, fallback: T, timeoutMs: number): Promise<T> {
  const bridge = win?.ReactNativeWebView;
  if (!win || !bridge) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (v: T) => {
      win.removeEventListener(APP_EVENT, onEvent);
      clearTimeout(timer);
      resolve(v);
    };
    const onEvent = (e: Event) => {
      const v = pick((e as CustomEvent).detail);
      if (v !== undefined) finish(v);
    };
    // 답이 동기로 올 수도 있어 리스너를 먼저 건다
    win.addEventListener(APP_EVENT, onEvent);
    timer = setTimeout(() => finish(fallback), timeoutMs);
    try {
      bridge.postMessage(message);
    } catch {
      finish(fallback); // 앱 쪽 연결이 끊긴 순간 — 기다려도 답이 없다
    }
  });
}

/** 스토어 가격(id → 현지 통화 문자열, 물은 id 만). 시간 초과·앱 밖이면 null — 우리 상수 가격으로 대신하지 않는다(스토어 가격을 보여야 한다).
 *  앱이 답했어도 물은 id 중 하나도 가격이 없으면(스토어에 상품이 안 잡힘) null = 못 받음 — 카드가 '…' 에 멈춘 채 안내도 없게 두지 않는다 */
export function askAppIapProducts(ids: string[], timeoutMs = 5000, win?: Window): Promise<Record<string, string> | null> {
  return ask<Record<string, string> | null>(
    bridgeWindow(win),
    encodeWebToAppWith("iap.products", { ids }),
    (detail) => {
      const msg = parseAppToWeb(detail);
      if (msg?.type !== "iap.products") return undefined;
      const priced = msg.items.filter((it) => ids.includes(it.id));
      return priced.length > 0 ? Object.fromEntries(priced.map((it) => [it.id, it.price])) : null;
    },
    null,
    timeoutMs,
  );
}

/** 스토어 가격을 (다시) 물을 때인가 — 앱 안 · 아직 못 받음 · 묻는 중 아님. 충전 시트는 늘 붙어 있어 열 때마다 이걸로 거른다 */
export function needsPriceAsk(s: { inApp: boolean; prices: Record<string, string> | null; inFlight: boolean }): boolean {
  return s.inApp && s.prices === null && !s.inFlight;
}

let inflight: Promise<IapResult> | null = null;

/** 구매 부탁. 기다림이 긴 건 사용자가 스토어 창을 보는 동안이라서. 시간 초과·앱 밖·연결 끊김 = failed(돈이 나갔다면 앱의 미완료 거래 재전송이 메운다) */
export function buyInApp(productId: string, timeoutMs = 600_000, win?: Window): Promise<IapResult> {
  if (inflight) return inflight;
  const failed: IapResult = { productId, ok: false, reason: "failed" };
  const p = ask<IapResult>(
    bridgeWindow(win),
    encodeWebToAppWith("iap.buy", { productId }),
    (detail) => {
      const msg = parseAppToWeb(detail);
      if (msg?.type !== "iap.result" || msg.productId !== productId) return undefined; // 다른 상품의 결과·다른 앱 신호는 이 답이 아니다
      const { v: _v, type: _t, ...result } = msg;
      return result;
    },
    failed,
    timeoutMs,
  ).finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
}

/** 앱 안 결제 화면의 안내 문구 — 🔴 웹 결제를 가리키는 말 금지(애플 3.1.1 외부 결제 유도) */
export const IAP_NOTICE = {
  pending: "결제 승인을 기다리고 있어. 승인되면 별이 들어와",
  failed: "결제를 마치지 못했어. 돈이 나갔다면 앱을 다시 열면 별이 들어와",
  update: "앱을 최신 버전으로 업데이트하면 충전할 수 있어",
  pricesUnavailable: "지금은 가격을 불러오지 못했어. 잠시 뒤에 다시 열어줘",
} as const;

/** 구매 결과 → 보여 줄 안내(성공은 화면이 따로 처리, 취소는 말 없이 = null) */
export function iapResultNotice(r: IapResult): string | null {
  if (r.ok || r.reason === "cancelled") return null;
  return r.reason === "pending" ? IAP_NOTICE.pending : IAP_NOTICE.failed;
}
