// 스토어 연결 — expo-iap 6.5.1(StoreKit 2 / Play Billing). 스펙 2026-11-23-앱-결제 §3. 판단(서버 확인·마무리 규칙)은 flow.ts.
// expo-iap 의 구매 결과는 반환값이 아니라 알림(purchaseUpdatedListener / purchaseErrorListener)으로 온다 — 기다리는 구매 하나에 짝지어 돌려주고,
// 짝이 없는 거래(승인 대기가 풀림·앱 밖에서 끝난 결제·늦게 온 결과)는 listenIapStore 의 onStorePurchase 로 넘긴다.
import {
  ErrorCode,
  fetchProducts as storeFetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type Purchase,
  type PurchaseAndroid,
  type PurchaseIOS,
} from "expo-iap";
import { Platform } from "react-native";
import { IAP_PRODUCT_IDS, type IapPriceItem } from "../../../lib/app-bridge/protocol.ts";
import type { IapDeps, PurchaseOutcome, StorePurchase } from "./flow.ts";
import { afterRequestPurchase } from "./request.ts";

/** 스토어가 매긴 거래 시각과 기기 시계의 어긋남 허용치 — 구매를 누르기 전 거래(옛 미완료 거래의 재전달)를 이 구매의 결과로 착각하지 않게.
 *  expo-iap 의 PURCHASE_REQUEST_CLOCK_SKEW_MS 와 같다. 착각해도 그 거래도 이 회원 것이라 서버 확인으로 가고, 진짜 결과는 짝 없는 거래로 처리된다 */
const CLOCK_SKEW_MS = 600_000;

// 마무리(finishTransaction)에는 스토어가 준 원래 거래 객체가 필요하다 — flow 는 StorePurchase 만 다루니 여기서 짝지어 둔다
const raws = new WeakMap<StorePurchase, Purchase>();

// 거래 객체엔 플랫폼 표시가 없다 — 이 앱이 도는 플랫폼의 스토어 거래다
function toStorePurchase(p: Purchase): StorePurchase {
  let s: StorePurchase;
  if (Platform.OS === "ios") {
    const t = p as PurchaseIOS;
    s = { platform: "ios", productId: t.productId, transactionId: t.transactionId || t.id, accountToken: t.appAccountToken ?? null };
  } else {
    const t = p as PurchaseAndroid;
    s = { platform: "android", productId: t.productId, purchaseToken: t.purchaseToken ?? undefined, accountToken: t.obfuscatedAccountIdAndroid ?? null };
  }
  raws.set(s, p);
  return s;
}

const isOurProduct = (id: string) => (IAP_PRODUCT_IDS as readonly string[]).includes(id);
const codeOf = (e: unknown): unknown => (e && typeof e === "object" && "code" in e ? (e as { code: unknown }).code : undefined);

/** 손님이 멈춤·승인 대기는 실패가 아니다 */
function outcomeOfError(e: unknown): "cancelled" | "pending" | null {
  const code = codeOf(e);
  if (code === ErrorCode.UserCancelled) return "cancelled";
  if (code === ErrorCode.DeferredPayment || code === ErrorCode.Pending) return "pending";
  return null;
}

// 스토어 연결 — 처음 쓸 때 한 번. 실패면 다음 호출 때 다시
let connecting: Promise<void> | null = null;
function connect(): Promise<void> {
  if (!connecting) {
    const run = initConnection().then((ok) => {
      if (!ok) throw new Error("store connection refused");
    });
    run.catch(() => {
      if (connecting === run) connecting = null;
    });
    connecting = run;
  }
  return connecting;
}

// 결과를 기다리는 구매 — 스토어 창은 한 번에 하나(flow.ts 도 하나만 연다)
// grace = iOS 빈 반환 뒤 늦게 올 알림을 기다리는 타이머(아래 purchase)
type Waiter = {
  productId: string;
  since: number;
  resolve(o: PurchaseOutcome): void;
  reject(e: unknown): void;
  grace?: ReturnType<typeof setTimeout>;
};
let waiting: Waiter | null = null;

/** 기다리는 구매를 비운다(타이머도) — 그 구매를 끝내는 쪽만 부른다 */
function release(w: Waiter): void {
  if (waiting === w) waiting = null;
  if (w.grace) clearTimeout(w.grace);
}

// iOS 에서 requestPurchase 반환값으로 끝낸 거래 — 같은 거래가 알림으로도 오면 한 번만 처리한다(아래 purchase)
const settledByReturn = new Set<string>();

function onUpdated(p: Purchase, onStorePurchase: (s: StorePurchase) => void): void {
  if (!isOurProduct(p.productId)) return;
  if (Platform.OS === "ios" && settledByReturn.delete((p as PurchaseIOS).transactionId || p.id)) return;
  const s = toStorePurchase(p);
  const w = waiting;
  if (w && p.productId === w.productId && p.transactionDate >= w.since - CLOCK_SKEW_MS) {
    release(w);
    w.resolve(s);
    return;
  }
  onStorePurchase(s);
}

function onError(e: { code?: unknown; productId?: string | null }): void {
  const w = waiting;
  if (!w || (e.productId && e.productId !== w.productId)) return;
  release(w);
  const o = outcomeOfError(e);
  if (o) w.resolve(o);
  else w.reject(e);
}

/** 스토어 알림을 붙인다(앱이 떠 있는 동안 한 번). 짝 없는 거래는 onStorePurchase 로. 떼는 함수를 돌려준다 */
export function listenIapStore(onStorePurchase: (s: StorePurchase) => void): () => void {
  try {
    const a = purchaseUpdatedListener((p) => onUpdated(p, onStorePurchase));
    const b = purchaseErrorListener(onError);
    return () => {
      a.remove();
      b.remove();
    };
  } catch (e) {
    console.warn("[iap] 스토어 알림을 못 붙였다", e);
    return () => {};
  }
}

export const iapStore: Pick<IapDeps, "fetchProducts" | "purchase" | "pending" | "finish"> = {
  async fetchProducts(ids: string[]): Promise<IapPriceItem[]> {
    await connect();
    const items = ((await storeFetchProducts({ skus: ids, type: "in-app" })) ?? []) as Product[];
    return items.map((p) => ({ id: p.id, price: p.displayPrice }));
  },

  async purchase(productId: string, accountToken: string): Promise<PurchaseOutcome> {
    await connect();
    if (waiting) {
      const old = waiting;
      release(old);
      old.reject(new Error("superseded"));
    }
    let me!: Waiter;
    const mine = new Promise<PurchaseOutcome>((resolve, reject) => {
      me = { productId, since: Date.now(), resolve, reject };
    });
    waiting = me;
    let returned: Purchase | Purchase[] | null | undefined;
    try {
      returned = await requestPurchase({
        type: "in-app",
        request: {
          apple: { sku: productId, appAccountToken: accountToken },
          google: { skus: [productId], obfuscatedAccountId: accountToken },
        },
      });
    } catch (e) {
      // 알림이 먼저 짝을 풀었으면 그 결과가 이미 정해졌다
      if (waiting !== me) return mine;
      // 바로 거절(취소가 알림 대신 여기로 오기도 한다)
      release(me);
      const o = outcomeOfError(e);
      if (o) return o;
      throw e;
    }
    // iOS 는 승인 대기(구입 요청)면 알림 없이 nil 로 끝날 수 있다 — 반환값으로도 끝낸다(request.ts)
    const after = afterRequestPurchase(Platform.OS === "ios" ? "ios" : "android", waiting === me, returned);
    if (after.kind === "wait") return mine;
    if (after.kind === "pendingAfter") {
      // 빈 반환이 취소 알림보다 먼저 닿을 수 있다(알림은 따로 메인 스레드를 거쳐 온다) — 잠깐 알림을 기다리고, 그래도 없으면 승인 대기
      me.grace = setTimeout(() => {
        if (waiting !== me) return;
        release(me);
        me.resolve("pending");
      }, after.ms);
      return mine;
    }
    release(me);
    const s = toStorePurchase(after.purchase);
    if (s.transactionId) settledByReturn.add(s.transactionId);
    return s;
  },

  /** 미완료 거래 — 애플은 마무리 안 된 거래(Transaction.unfinished), 구글은 소비 안 된 구매 */
  async pending(): Promise<StorePurchase[]> {
    await connect();
    const list: Purchase[] = Platform.OS === "ios" ? await getPendingTransactionsIOS() : await getAvailablePurchases();
    return list.filter((p) => isOurProduct(p.productId)).map(toStorePurchase);
  },

  async finish(s: StorePurchase): Promise<void> {
    const p = raws.get(s);
    if (!p) throw new Error("unknown purchase");
    try {
      await finishTransaction({ purchase: p, isConsumable: true });
    } catch (e) {
      // 구글은 서버가 지급 뒤 먼저 소비한다(app/api/payment/iap) — '이미 소비됨(ITEM_NOT_OWNED)'은 성공이다
      if (s.platform === "android" && codeOf(e) === ErrorCode.ItemNotOwned) return;
      throw e;
    }
  },
};
