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
 * respond 는 fetch 가 받은 init(signal 포함)을 받는다 · timeoutMs 를 주면 fetchWallet 의 제한 시간으로 넘긴다(생략 = 기본값).
 * 끝나면(finally) 원래 fetch 로 되돌린다.
 */
async function fetchWalletWith(respond: (init?: RequestInit) => Promise<Response>, timeoutMs?: number) {
  const original = globalThis.fetch;
  const sent: SentEvent[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === "/api/event") {
      sent.push(JSON.parse(String(init?.body)) as SentEvent);
      return new Response(null, { status: 204 });
    }
    return respond(init);
  }) as typeof fetch;
  try {
    const wallet = await fetchWallet(timeoutMs);
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

// ── 제한 시간 ── 기본값(5초)을 그대로 두면 테스트가 5초 걸리니 짧은 값을 넣는다. { timeout } 은 구현이 깨졌을 때 테스트가 매달리지 않게 하는 안전망이자,
// 넘긴 값이 실제로 쓰였는지(기본 5초였다면 2초를 넘겨 실패)의 확인이다.

/** 안 끝나는 fetch — 브라우저처럼 signal 이 abort 돼야만 AbortError 로 끝난다. signal 을 안 넘겼으면 바로 실패시킨다 */
function neverEndingFetch(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error("fetchWallet 이 signal 을 안 넘겼다"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

test("fetchWallet — 제한 시간 안에 안 끝나면 끊고 null · status 는 'timeout'", { timeout: 2000 }, async () => {
  const { wallet, sent } = await fetchWalletWith(neverEndingFetch, 20);
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: "timeout" } }]);
});

test("fetchWallet — 응답 헤더는 왔는데 본문이 안 끝나도 제한 시간에 끊는다(본문 읽기까지 덮는다) · status 는 200 이 아니라 'timeout'", { timeout: 2000 }, async () => {
  const { wallet, sent } = await fetchWalletWith(async (init) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(body, { status: 200 });
  }, 20);
  assert.equal(wallet, null);
  if (canTrack) assert.deepEqual(sent, [{ event: "wallet_fetch_failed", meta: { status: "timeout" } }]);
});

test("fetchWallet — 정상 응답이면 타이머를 남기지 않는다(제한 시간이 지나도 signal 이 abort 되지 않는다)", async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const { wallet } = await fetchWalletWith(async (init) => {
    signals.push(init?.signal);
    return new Response(JSON.stringify({ balance: 3, isGuest: false }), { status: 200 });
  }, 100);
  assert.equal(wallet?.balance, 3);
  await new Promise((resolve) => setTimeout(resolve, 250)); // 제한 시간(100ms)을 넉넉히 넘겨 기다린다 — 타이머가 남았다면 그 사이 abort 된다
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.aborted, false);
});
