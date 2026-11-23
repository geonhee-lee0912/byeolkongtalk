// 앱 결제 흐름 — 스토어 결제 → 서버 확인(POST /api/payment/iap) → 거래 마무리. 스펙 2026-11-23-앱-결제 §3.
// 순수 모듈(스토어·서버 호출 주입 — 실물은 store.ts·api.ts, 테스트는 flow.test.ts). react-native·expo import 금지(루트 CI 가 돌린다).
// 🔴 마무리(finish)는 서버가 ok(지급·already) 또는 revoked 를 줄 때만. 그 밖(account_mismatch·pending·네트워크·4xx·5xx)은 남겨 두고
//    다음 실행·로그인 때 다시 보낸다(서버는 같은 거래에 별을 두 번 주지 않는다 — payments.pg_tid 유니크). 돈이 나간 거래를 조용히 소비하지 않는다.
// 🔴 웹은 구매 하나에 답 하나를 최대 10분 기다리며 다른 구매를 막는다 — buy 는 어느 길로 가든 결과를 꼭 하나 돌려준다(던지지 않는다).
import type { IapFailReason, IapPriceItem, IapResult } from "../../../lib/app-bridge/protocol.ts";

/** 스토어 거래 — 애플은 transactionId, 구글은 purchaseToken 이 서버 확인 열쇠. accountToken = 결제 때 실은 계정 토큰(없으면 null) */
export type StorePurchase = {
  platform: "ios" | "android";
  productId: string;
  transactionId?: string;
  purchaseToken?: string;
  accountToken: string | null;
};

/** 서버 확인 답 — 2xx 면 지급 결과, 아니면 상태 코드와 error 코드. 네트워크 실패는 confirm 이 던진다 */
export type ConfirmReply =
  | { ok: true; stars: number; bonusStars: number; balance: number }
  | { ok: false; status: number; error: string };

/** 스토어 창의 끝 — 거래 / 사용자가 닫음 / 승인 대기(애플 '구입 요청' 등 — 승인되면 스토어 알림으로 다시 온다) */
export type PurchaseOutcome = StorePurchase | "cancelled" | "pending";

export type IapDeps = {
  /** 유효한 앱 액세스 토큰. 로그인 안 됨이면 null, 네트워크 문제면 throw (auth/session.ts) */
  ensureAccessToken(): Promise<string | null>;
  /** 이 회원의 스토어 계정 토큰(GET /api/payment/iap) */
  accountToken(access: string): Promise<string>;
  fetchProducts(ids: string[]): Promise<IapPriceItem[]>;
  purchase(productId: string, accountToken: string): Promise<PurchaseOutcome>;
  /** 스토어에 남은 미완료 거래 */
  pending(): Promise<StorePurchase[]>;
  confirm(p: StorePurchase, access: string): Promise<ConfirmReply>;
  finish(p: StorePurchase): Promise<void>;
  warn(message: string, e: unknown): void;
};

/** 스토어 창을 이만큼 기다린 뒤엔 웹에 failed 를 준다(웹은 10분 기다린다 — 그 전에). 늦게 온 거래도 서버 확인까지 간다(buyOnce 는 계속 돈다) */
const BUY_TIMEOUT_MS = 9 * 60_000;

type Settled = { ok: true; stars: number; bonusStars: number; balance: number } | { ok: false; reason: IapFailReason };
const FAILED: Settled = { ok: false, reason: "failed" };

export function createIapFlow(deps: IapDeps, opts: { buyTimeoutMs?: number } = {}) {
  const buyTimeoutMs = opts.buyTimeoutMs ?? BUY_TIMEOUT_MS;
  const warn = (m: string, e: unknown) => {
    try {
      deps.warn(m, e);
    } catch {
      // 기록 실패가 결과를 막지 않게
    }
  };

  // 계정 토큰 — 받은 액세스 토큰별로 한 번(로그인·갱신이면 액세스 토큰이 바뀌어 다시 받는다). 메모리에만, 로그아웃 때 비운다
  let account: { access: string; token: Promise<string> } | null = null;
  function accountTokenFor(access: string): Promise<string> {
    if (account?.access === access) return account.token;
    const token = deps.accountToken(access);
    const entry = { access, token };
    account = entry;
    // 실패는 기억하지 않는다 — 다음 구매 때 다시 받는다
    token.catch(() => {
      if (account === entry) account = null;
    });
    return token;
  }

  function forgetAccount(): void {
    account = null;
  }

  /** 지금 회원의 액세스 토큰·계정 토큰. 로그인 안 됨이면 null */
  async function member(): Promise<{ access: string; token: string } | null> {
    const access = await deps.ensureAccessToken();
    if (!access) return null;
    return { access, token: await accountTokenFor(access) };
  }

  async function finishQuietly(p: StorePurchase): Promise<void> {
    try {
      await deps.finish(p);
    } catch (e) {
      // 별은 이미 들어갔다. 스토어에 남은 거래는 다음 재전송이 already 로 다시 마무리한다(두 번 지급되지 않는다)
      warn("[iap] 거래 마무리 실패 — 다음 실행 때 다시", e);
    }
  }

  async function settleOnce(p: StorePurchase, access: string): Promise<Settled> {
    let r: ConfirmReply;
    try {
      r = await deps.confirm(p, access);
    } catch (e) {
      warn("[iap] 서버 확인 실패(네트워크) — 다음 실행 때 다시", e);
      return FAILED;
    }
    if (r.ok) {
      await finishQuietly(p);
      return { ok: true, stars: r.stars, bonusStars: r.bonusStars, balance: r.balance };
    }
    // 환불·취소된 거래 — 지급할 것이 없다. 스토어에 남겨 두면 실행마다 다시 온다
    if (r.error === "revoked") {
      await finishQuietly(p);
      return FAILED;
    }
    if (r.error === "pending") return { ok: false, reason: "pending" };
    if (r.error === "account_mismatch") return { ok: false, reason: "account_mismatch" };
    // 400 = 앱과 서버의 약속이 어긋났다(버그) — 마무리하지 않고 남긴다
    if (r.status === 400) warn(`[iap] 서버가 거래를 거절했다(${r.error}) — 마무리하지 않는다`, null);
    else warn(`[iap] 서버 확인 실패(${r.status} ${r.error}) — 다음 실행 때 다시`, null);
    return FAILED;
  }

  // 같은 거래가 스토어 알림·재전송·구매 결과로 동시에 와도 서버 확인·마무리는 한 번(진행 중일 때만 묶는다)
  const settling = new Map<string, Promise<Settled>>();
  function settle(p: StorePurchase, access: string): Promise<Settled> {
    const id = p.platform === "ios" ? p.transactionId : p.purchaseToken;
    if (!id) {
      warn("[iap] 거래 식별자가 없다 — 보내지 않는다", null);
      return Promise.resolve(FAILED);
    }
    const key = `${p.platform}:${id}`;
    const running = settling.get(key);
    if (running) return running;
    const run = settleOnce(p, access).finally(() => settling.delete(key));
    settling.set(key, run);
    return run;
  }

  /** 스토어에 남은 거래 하나 — 지금 회원의 계정 토큰이거나 토큰이 빈 거래만 보낸다(빈 것은 서버가 정한다). 다른 계정 거래는 건드리지 않는다 */
  function settleIfMine(p: StorePurchase, m: { access: string; token: string }): Promise<Settled> | null {
    if (p.accountToken !== null && p.accountToken.toLowerCase() !== m.token.toLowerCase()) return null;
    return settle(p, m.access);
  }

  async function buyOnce(productId: string): Promise<Settled> {
    const m = await member();
    if (!m) return FAILED; // 앱 상점은 로그인한 사람만 결제 버튼이 있다 — 여기 오면 그사이 로그아웃
    const outcome = await deps.purchase(productId, m.token);
    if (outcome === "cancelled") return { ok: false, reason: "cancelled" };
    if (outcome === "pending") return { ok: false, reason: "pending" };
    return settle(outcome, m.access);
  }

  function timeout(): { promise: Promise<Settled>; clear(): void } {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<Settled>((resolve) => {
      timer = setTimeout(() => resolve(FAILED), buyTimeoutMs);
    });
    return { promise, clear: () => clearTimeout(timer) };
  }

  let buying: { productId: string; result: Promise<IapResult> } | null = null;

  /** 구매 — 결과는 꼭 하나(던지지 않는다). 진행 중 같은 상품이면 같은 결과, 다른 상품이면 그 상품은 바로 failed(스토어 창은 한 번에 하나) */
  function buy(productId: string): Promise<IapResult> {
    if (buying) {
      return buying.productId === productId ? buying.result : Promise.resolve({ productId, ...FAILED });
    }
    const t = timeout();
    const run = buyOnce(productId).catch((e: unknown): Settled => {
      warn("[iap] 구매 실패", e);
      return FAILED;
    });
    const entry = {
      productId,
      result: Promise.race([run, t.promise]).then((s): IapResult => {
        t.clear();
        if (buying === entry) buying = null;
        return { productId, ...s };
      }),
    };
    buying = entry;
    return entry.result;
  }

  /** 스토어 알림으로 온 거래(승인 대기가 풀림·앱 밖에서 끝난 결제 등). 로그인 안 됨이면 아무것도 안 한다. 던지지 않는다 */
  async function handleStorePurchase(p: StorePurchase): Promise<void> {
    try {
      const m = await member();
      if (m) await settleIfMine(p, m);
    } catch (e) {
      warn("[iap] 스토어 알림 거래 처리 실패 — 다음 실행 때 다시", e);
    }
  }

  /** 미완료 거래 재전송 — 앱 실행·로그인 뒤. 로그인 안 됨이면 아무것도 안 한다. 던지지 않는다 */
  async function resumePending(): Promise<void> {
    try {
      const m = await member();
      if (!m) return;
      for (const p of await deps.pending()) await settleIfMine(p, m);
    } catch (e) {
      warn("[iap] 미완료 거래 재전송 실패 — 다음 실행 때 다시", e);
    }
  }

  /** 스토어 가격(현지 통화 문자열 그대로). 스토어가 안 준 상품은 뺀다. 실패면 빈 목록. 던지지 않는다 */
  async function products(ids: string[]): Promise<IapPriceItem[]> {
    try {
      const items = await deps.fetchProducts(ids);
      return items.filter((it) => ids.includes(it.id) && typeof it.price === "string" && it.price.length > 0);
    } catch (e) {
      warn("[iap] 스토어 가격을 못 받았다", e);
      return [];
    }
  }

  return { products, buy, resumePending, handleStorePurchase, forgetAccount };
}

export type IapFlow = ReturnType<typeof createIapFlow>;
