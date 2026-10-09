import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWallet, parseWallet } from "./wallet.ts";
import { menuArmOf } from "./tarot/menu-ab.ts";

test("parseWallet — 정상 응답", () => {
  assert.deepEqual(parseWallet({ balance: 15, isGuest: false, giftUnused: true, menuArm: "menu" }), {
    balance: 15,
    isGuest: false,
    giftUnused: true,
    menuArm: "menu",
  });
  assert.deepEqual(parseWallet({ balance: 0, isGuest: true, giftUnused: false, menuArm: "legacy" }), {
    balance: 0,
    isGuest: true,
    giftUnused: false,
    menuArm: "legacy",
  });
});

test("parseWallet — 모르는 값·실패는 안전한 쪽(잔액 0 · 게스트 · 선물 약속 없음 · 스위치가 정한 비로그인 그룹)", () => {
  const safe = { balance: 0, isGuest: true, giftUnused: false, menuArm: menuArmOf(null) };
  assert.deepEqual(parseWallet(null), safe);
  assert.deepEqual(parseWallet(undefined), safe);
  assert.deepEqual(parseWallet({ balance: "3", giftUnused: "true", menuArm: "x" }), safe);
});

type SentEvent = { event: string; meta?: { status?: number | string } };

/**
 * globalThis.fetch 를 잠깐 바꿔 /api/stars/balance 는 respond 가 답하게 하고, /api/event 로 나간 본문은 sent 에 모은다.
 * 끝나면(finally) 원래 fetch 로 되돌린다.
 */
async function fetchWalletWith(respond: () => Promise<Response>) {
  const original = globalThis.fetch;
  const sent: SentEvent[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "/api/event") {
      sent.push(JSON.parse(String(init?.body)) as SentEvent);
      return new Response(null, { status: 204 });
    }
    return respond();
  }) as typeof fetch;
  try {
    const wallet = await fetchWallet();
    return { wallet, sent };
  } finally {
    globalThis.fetch = original;
  }
}

// trackUiEvent 는 navigator 가 있어야 발사한다(노드 21+). 없는 노드에선 이벤트 단언만 건너뛴다.
const canTrack = typeof navigator !== "undefined";

test("fetchWallet — 200 이면 응답을 parseWallet 한 값(모르는 필드는 버린다) · 이벤트는 안 남긴다", async () => {
  const body = { balance: 15, isGuest: false, giftUnused: true, menuArm: "menu", extra: "버려진다" };
  const { wallet, sent } = await fetchWalletWith(async () => new Response(JSON.stringify(body), { status: 200 }));
  assert.deepEqual(wallet, { balance: 15, isGuest: false, giftUnused: true, menuArm: "menu" });
  assert.deepEqual(sent, []);
});

test("fetchWallet — 500 이면 null · wallet_fetch_failed(status:500) 를 남긴다", async () => {
  const { wallet, sent } = await fetchWalletWith(async () => new Response("boom", { status: 500 }));
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: 500 } }]);
});

test("fetchWallet — fetch 가 던지면 null · status 는 'network'", async () => {
  const { wallet, sent } = await fetchWalletWith(async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: "network" } }]);
});

test("fetchWallet — 200 인데 본문이 JSON 이 아니어도 null · 받은 응답 상태(200)로 센다", async () => {
  const { wallet, sent } = await fetchWalletWith(async () => new Response("<html>not json</html>", { status: 200 }));
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: 200 } }]);
});
