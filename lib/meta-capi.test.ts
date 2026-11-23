// 앱 안에서는 Meta 로 광고 측정 이벤트를 보내지 않는다(애플 5.1.2 — ATT 없이 '추적' 금지, 운영자 결정 2026-11-23).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_META_PIXEL_ID = "pixel-test";
process.env.META_CAPI_ACCESS_TOKEN = "token-test";

const sent: string[] = [];
globalThis.fetch = (async (url: string | URL) => {
  sent.push(String(url));
  return new Response("{}", { status: 200 });
}) as typeof fetch;

// 모듈이 PIXEL_ID·토큰을 import 때 읽어서, env 를 넣은 뒤에 불러온다
const load = () => import("./meta-capi.ts");

const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://byeolkongtalk.com${path}`, { headers: { "user-agent": BROWSER_UA, ...headers } });
const flush = () => new Promise((r) => setTimeout(r, 20));

test("브라우저 요청은 앱이 아니다", async () => {
  const { capiSignalsFromRequest } = await load();
  assert.equal(capiSignalsFromRequest(req("/api/profiles")).fromApp, false);
});

test("앱 웹뷰(UA 꼬리 ByeolkongApp)·앱 로그인 주소·앱 토큰(Bearer) 요청은 앱이다", async () => {
  const { capiSignalsFromRequest } = await load();
  assert.equal(capiSignalsFromRequest(req("/api/profiles", { "user-agent": `${BROWSER_UA} ByeolkongApp/1.0.0 (ios)` })).fromApp, true);
  assert.equal(capiSignalsFromRequest(req("/api/auth/app/kakao", { "user-agent": "okhttp/4.12.0" })).fromApp, true);
  assert.equal(capiSignalsFromRequest(req("/api/payment/iap", { authorization: "Bearer abc" })).fromApp, true);
});

test("앱에서 온 이벤트는 Meta 로 보내지 않고, 브라우저 이벤트는 보낸다", async () => {
  const { capiSignalsFromRequest, sendCapiEvent } = await load();
  sent.length = 0;
  sendCapiEvent({ eventName: "Lead", userId: "u1", eventId: "lead:u1", ...capiSignalsFromRequest(req("/api/profiles", { "user-agent": `${BROWSER_UA} ByeolkongApp/1.0.0 (android)`, cookie: "_fbc=fb.1.1.x" })) });
  await flush();
  assert.equal(sent.length, 0);

  sendCapiEvent({ eventName: "Lead", userId: "u2", eventId: "lead:u2", ...capiSignalsFromRequest(req("/api/profiles", { cookie: "_fbc=fb.1.1.x" })) });
  await flush();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /graph\.facebook\.com/);
});
