import { test } from "node:test";
import assert from "node:assert/strict";
import { askAppIapProducts, buyInApp, iapResultNotice, IAP_NOTICE, needsPriceAsk } from "./app-iap.ts";
import {
  APP_EVENT,
  encodeAppToWebBack,
  encodeAppToWebIapProducts,
  encodeAppToWebIapResult,
  parseWebToApp,
  type IapResult,
} from "./app-bridge/protocol.ts";

type FakeWin = EventTarget & { ReactNativeWebView?: { postMessage(m: string): void }; posted: string[] };

/** reply: postMessage 를 받으면 그 detail 들을 (동기로) 쏜다. inApp=false 면 ReactNativeWebView 없음 */
function fakeWin(opts: { reply?: unknown[]; inApp?: boolean; throws?: boolean } = {}): Window {
  const w = new EventTarget() as FakeWin;
  w.posted = [];
  if (opts.inApp !== false) {
    w.ReactNativeWebView = {
      postMessage(m: string) {
        if (opts.throws) throw new Error("bridge gone");
        w.posted.push(m);
        for (const detail of opts.reply ?? []) w.dispatchEvent(new CustomEvent(APP_EVENT, { detail }));
      },
    };
  }
  return w as unknown as Window;
}
const posted = (w: Window) => (w as unknown as FakeWin).posted;
const fire = (w: Window, detail: unknown) => w.dispatchEvent(new CustomEvent(APP_EVENT, { detail }));

test("가격 — 앱이 답하면 id→가격 표, 보낸 메시지는 iap.products{ids}", async () => {
  const w = fakeWin({
    reply: [encodeAppToWebBack(), encodeAppToWebIapProducts([{ id: "star_10", price: "₩1,000" }, { id: "star_30", price: "₩2,800" }])],
  });
  assert.deepEqual(await askAppIapProducts(["star_10", "star_30"], 50, w), { star_10: "₩1,000", star_30: "₩2,800" });
  assert.deepEqual(parseWebToApp(posted(w)[0]), { v: 1, type: "iap.products", payload: { ids: ["star_10", "star_30"] } });
});

test("가격 — 답이 없으면 시간 초과에 null, 앱 밖·연결 끊김도 null", async () => {
  assert.equal(await askAppIapProducts(["star_10"], 10, fakeWin()), null);
  const t = Date.now();
  assert.equal(await askAppIapProducts(["star_10"], 5000, fakeWin({ inApp: false })), null);
  assert.equal(await askAppIapProducts(["star_10"], 5000, fakeWin({ throws: true })), null);
  assert.ok(Date.now() - t < 500);
  assert.equal(await askAppIapProducts(["star_10"], 10), null); // window 없음(node)
});

test("가격 — 앱이 답했는데 물은 id 중 하나도 가격이 없으면(빈 목록·모르는 id 만) null = 못 받음 — 카드가 '…' 에 멈추지 않게", async () => {
  assert.equal(await askAppIapProducts(["star_10", "star_30"], 50, fakeWin({ reply: [encodeAppToWebIapProducts([])] })), null);
  assert.equal(
    await askAppIapProducts(["star_10"], 50, fakeWin({ reply: [encodeAppToWebIapProducts([{ id: "star_30", price: "₩2,800" }])] })),
    null,
  );
  // 하나라도 있으면 받은 것(나머지 칸은 버튼이 막힌다)
  assert.deepEqual(
    await askAppIapProducts(["star_10", "star_30"], 50, fakeWin({ reply: [encodeAppToWebIapProducts([{ id: "star_30", price: "₩2,800" }])] })),
    { star_30: "₩2,800" },
  );
});

test("가격 다시 묻기 — 앱 안 · 아직 가격 없음 · 묻는 중 아님일 때만(시트를 다시 열 때 한 번)", () => {
  assert.equal(needsPriceAsk({ inApp: true, prices: null, inFlight: false }), true);
  assert.equal(needsPriceAsk({ inApp: true, prices: null, inFlight: true }), false, "이미 묻는 중 — 겹쳐 묻지 않는다");
  assert.equal(needsPriceAsk({ inApp: true, prices: { star_10: "₩1,000" }, inFlight: false }), false, "받았으면 다시 안 묻는다");
  assert.equal(needsPriceAsk({ inApp: false, prices: null, inFlight: false }), false, "앱 밖(토스)엔 묻지 않는다");
});

test("구매 — 같은 상품의 결과를 돌려준다(다른 상품의 결과·다른 신호는 이 답이 아니다)", async () => {
  const w = fakeWin();
  const p = buyInApp("star_30", 1000, w);
  assert.deepEqual(parseWebToApp(posted(w)[0]), { v: 1, type: "iap.buy", payload: { productId: "star_30" } });
  fire(w, encodeAppToWebIapResult({ productId: "star_10", ok: false, reason: "failed" }));
  fire(w, encodeAppToWebBack());
  const ok: IapResult = { productId: "star_30", ok: true, stars: 30, bonusStars: 6, balance: 40 };
  fire(w, encodeAppToWebIapResult(ok));
  assert.deepEqual(await p, ok);
});

test("구매 — 진행 중에 또 부르면 같은 약속(메시지도 한 번만), 끝나면 새로 보낸다", async () => {
  const w = fakeWin();
  const a = buyInApp("star_30", 1000, w);
  const b = buyInApp("star_70", 1000, w);
  assert.equal(a, b);
  assert.equal(posted(w).length, 1);
  fire(w, encodeAppToWebIapResult({ productId: "star_30", ok: false, reason: "cancelled" }));
  assert.deepEqual(await a, { productId: "star_30", ok: false, reason: "cancelled" });
  const c = buyInApp("star_10", 1000, w);
  assert.notEqual(c, a);
  assert.equal(posted(w).length, 2);
  fire(w, encodeAppToWebIapResult({ productId: "star_10", ok: false, reason: "pending" }));
  assert.equal((await c).ok, false);
});

test("구매 — 시간 초과·앱 밖·연결 끊김은 failed", async () => {
  assert.deepEqual(await buyInApp("star_10", 10, fakeWin()), { productId: "star_10", ok: false, reason: "failed" });
  assert.deepEqual(await buyInApp("star_10", 1000, fakeWin({ inApp: false })), { productId: "star_10", ok: false, reason: "failed" });
  assert.deepEqual(await buyInApp("star_10", 1000, fakeWin({ throws: true })), { productId: "star_10", ok: false, reason: "failed" });
});

test("결과 안내 문구 — 성공·취소는 말 없음, 대기·실패는 정해진 문구", () => {
  assert.equal(iapResultNotice({ productId: "star_10", ok: true, stars: 10, bonusStars: 0, balance: 10 }), null);
  assert.equal(iapResultNotice({ productId: "star_10", ok: false, reason: "cancelled" }), null);
  assert.equal(iapResultNotice({ productId: "star_10", ok: false, reason: "pending" }), "결제 승인을 기다리고 있어. 승인되면 별이 들어와");
  for (const reason of ["failed", "account_mismatch"] as const)
    assert.equal(iapResultNotice({ productId: "star_10", ok: false, reason }), "결제를 마치지 못했어. 돈이 나갔다면 앱을 다시 열면 별이 들어와");
  assert.equal(IAP_NOTICE.update, "앱을 최신 버전으로 업데이트하면 충전할 수 있어");
  // 앱 안 문구는 웹 결제를 가리키지 않는다(애플 3.1.1)
  for (const s of Object.values(IAP_NOTICE)) assert.doesNotMatch(s, /웹|홈페이지|토스|사이트|브라우저/);
});
