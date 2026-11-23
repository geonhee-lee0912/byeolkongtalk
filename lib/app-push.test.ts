import { test } from "node:test";
import assert from "node:assert/strict";
import { askAppPush } from "./app-push.ts";
import { APP_EVENT, encodeAppToWeb, parseWebToApp, type PushState } from "./app-bridge/protocol.ts";

type FakeWin = EventTarget & { ReactNativeWebView?: { postMessage(m: string): void }; posted: string[] };

/** reply: postMessage 를 받으면 그 detail 들을 (동기로) 쏜다. null 이면 응답 없음, inApp=false 면 ReactNativeWebView 없음 */
function fakeWin(opts: { reply?: unknown[] | null; inApp?: boolean } = {}): Window {
  const w = new EventTarget() as FakeWin;
  w.posted = [];
  if (opts.inApp !== false) {
    w.ReactNativeWebView = {
      postMessage(m: string) {
        w.posted.push(m);
        for (const detail of opts.reply ?? []) w.dispatchEvent(new CustomEvent(APP_EVENT, { detail }));
      },
    };
  }
  return w as unknown as Window;
}

const posted = (w: Window) => (w as unknown as FakeWin).posted;

test("응답이 오면 상태를 돌려준다", async () => {
  for (const s of ["granted", "denied", "undetermined"] as PushState[]) {
    const w = fakeWin({ reply: [encodeAppToWeb(s)] });
    assert.equal(await askAppPush("push.status", { win: w }), s);
    assert.equal(parseWebToApp(posted(w)[0])?.type, "push.status");
  }
  const w = fakeWin({ reply: [encodeAppToWeb("granted")] });
  assert.equal(await askAppPush("push.request", { win: w }), "granted");
  assert.equal(parseWebToApp(posted(w)[0])?.type, "push.request");
});

test("응답이 없으면 시간 초과에 null", async () => {
  assert.equal(await askAppPush("push.status", { win: fakeWin({ reply: null }), timeoutMs: 10 }), null);
});

test("이상한 detail 은 무시하고 기다린다", async () => {
  const w = fakeWin({ reply: ["not json", 42, null, JSON.stringify({ v: 1, type: "x" }), encodeAppToWeb("denied")] });
  assert.equal(await askAppPush("push.status", { win: w, timeoutMs: 50 }), "denied");
  // 이상한 것만 오면 시간 초과
  const bad = fakeWin({ reply: ["nope"] });
  assert.equal(await askAppPush("push.status", { win: bad, timeoutMs: 10 }), null);
});

test("앱 밖이면 기다리지 않고 null, 아무것도 보내지 않는다", async () => {
  const w = fakeWin({ inApp: false });
  const t = Date.now();
  assert.equal(await askAppPush("push.request", { win: w, timeoutMs: 5000 }), null);
  assert.ok(Date.now() - t < 500);
  assert.equal(await askAppPush("push.status"), null); // window 없음(node)
});

test("끝나면 리스너를 뗀다 — 뒤늦은 응답이 와도 영향 없음", async () => {
  const w = fakeWin({ reply: [encodeAppToWeb("granted")] });
  let removed = 0;
  const orig = w.removeEventListener.bind(w);
  w.removeEventListener = ((...a: Parameters<typeof orig>) => {
    removed++;
    return orig(...a);
  }) as typeof w.removeEventListener;
  await askAppPush("push.status", { win: w });
  assert.equal(removed, 1);
  const t = fakeWin({ reply: null });
  let removed2 = 0;
  const orig2 = t.removeEventListener.bind(t);
  t.removeEventListener = ((...a: Parameters<typeof orig2>) => {
    removed2++;
    return orig2(...a);
  }) as typeof t.removeEventListener;
  await askAppPush("push.status", { win: t, timeoutMs: 5 });
  assert.equal(removed2, 1);
});
