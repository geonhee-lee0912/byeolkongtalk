import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_UA_TOKEN,
  appUserAgentSuffix,
  encodeWebToApp,
  isAppInfo,
  parseAppUserAgent,
  parseWebToApp,
} from "./protocol.ts";

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36";

test("UA 표식 — 앱이 붙인 꼬리를 다시 읽으면 같은 값(iOS·안드로이드 웹뷰)", () => {
  const ios = { version: "1.0.0", platform: "ios" as const };
  const android = { version: "1.2.3", platform: "android" as const };
  assert.equal(appUserAgentSuffix(ios), "ByeolkongApp/1.0.0 (ios)");
  assert.deepEqual(parseAppUserAgent(`${IOS_UA} ${appUserAgentSuffix(ios)}`), ios);
  assert.deepEqual(parseAppUserAgent(`${ANDROID_UA} ${appUserAgentSuffix(android)}`), android);
});

test("일반 브라우저·빈 값은 앱이 아니다", () => {
  assert.equal(parseAppUserAgent(IOS_UA), null);
  assert.equal(parseAppUserAgent(""), null);
  assert.equal(parseAppUserAgent(null), null);
  assert.equal(APP_UA_TOKEN, "ByeolkongApp");
});

test("isAppInfo — 앱이 주입한 값의 모양만 받는다", () => {
  assert.equal(isAppInfo({ version: "1.0.0", platform: "ios" }), true);
  assert.equal(isAppInfo({ version: "1.0.0", platform: "web" }), false);
  assert.equal(isAppInfo({ platform: "android" }), false);
  assert.equal(isAppInfo(null), false);
  assert.equal(isAppInfo("ios"), false);
});

test("메시지 — 만들고 읽으면 같은 종류, 모르는 종류·버전·깨진 JSON 은 버린다", () => {
  assert.deepEqual(parseWebToApp(encodeWebToApp("auth.loggedOut")), { v: 1, type: "auth.loggedOut", payload: {} });
  assert.equal(parseWebToApp(JSON.stringify({ v: 1, type: "auth.token", payload: { token: "x" } })), null);
  assert.equal(parseWebToApp(JSON.stringify({ v: 2, type: "auth.loggedOut", payload: {} })), null);
  assert.equal(parseWebToApp("{"), null);
  assert.equal(parseWebToApp("null"), null);
});
