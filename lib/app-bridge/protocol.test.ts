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

// 서버 관문(handoff·reset)은 parseAppUserAgent 가 null 이면 앱을 브라우저로 본다 — 앱이 못 읽히는 꼬리를 붙이면 앱 로그인이 오류 없이 막힌다
test("UA 표식 — 버전이 어떤 문자열이어도 꼬리는 늘 앱으로 읽힌다(읽을 수 있는 버전은 그대로)", () => {
  const odd = ["1.0.0+5", "1.0.0 (beta)", "", " ", "1.0.0)", "버전1", "1.0.0\n", "x ByeolkongApp/1 (android)", "a".repeat(200)];
  for (const platform of ["ios", "android"] as const) {
    for (const version of odd) {
      const ua = `${IOS_UA} ${appUserAgentSuffix({ version, platform })}`;
      assert.equal(parseAppUserAgent(ua)?.platform, platform, `${platform} ${JSON.stringify(version)}`);
    }
  }
  for (const version of ["0", "1.0", "10.20.30", "1.0.0-beta.1", "2026.10.16", "a".repeat(32)]) {
    assert.deepEqual(parseAppUserAgent(`${ANDROID_UA} ${appUserAgentSuffix({ version, platform: "android" })}`), { version, platform: "android" });
  }
  // 바꾸는 규칙: 허용 문자 밖은 "_"(semver 에 없는 문자 — 바뀐 값을 정상 버전으로 착각하지 않게), 32자까지, 비면 "0"
  assert.equal(appUserAgentSuffix({ version: "1.0.0+5", platform: "ios" }), "ByeolkongApp/1.0.0_5 (ios)");
  assert.equal(appUserAgentSuffix({ version: "", platform: "android" }), "ByeolkongApp/0 (android)");
  assert.equal(appUserAgentSuffix({ version: "b".repeat(40), platform: "ios" }), `ByeolkongApp/${"b".repeat(32)} (ios)`);
});

test("일반 브라우저·빈 값은 앱이 아니다", () => {
  assert.equal(parseAppUserAgent(IOS_UA), null);
  assert.equal(parseAppUserAgent(""), null);
  assert.equal(parseAppUserAgent(null), null);
  assert.equal(APP_UA_TOKEN, "ByeolkongApp");
});

test("비슷하기만 한 꼬리는 앱이 아니다 — 모르는 플랫폼·빈 버전·32자 넘는 버전", () => {
  for (const tail of ["ByeolkongApp/1.0.0 (web)", "ByeolkongApp/ (ios)", `ByeolkongApp/${"1".repeat(33)} (ios)`]) {
    assert.equal(parseAppUserAgent(`${IOS_UA} ${tail}`), null, tail);
  }
});

test("isAppInfo — 앱이 주입한 값의 모양만 받는다", () => {
  assert.equal(isAppInfo({ version: "1.0.0", platform: "ios" }), true);
  assert.equal(isAppInfo({ version: "1.0.0", platform: "web" }), false);
  assert.equal(isAppInfo({ platform: "android" }), false);
  assert.equal(isAppInfo({ version: 1, platform: "ios" }), false);
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

test("메시지 — 선 위 모양 고정(현장의 옛 앱이 읽는다), 웹이 보낸 payload 는 버리고, 비슷한 값은 받지 않는다", () => {
  assert.deepEqual(JSON.parse(encodeWebToApp("auth.loggedOut")), { v: 1, type: "auth.loggedOut", payload: {} });
  assert.deepEqual(parseWebToApp(JSON.stringify({ v: 1, type: "auth.loggedOut", payload: { token: "x" } })), {
    v: 1,
    type: "auth.loggedOut",
    payload: {},
  });
  for (const raw of [
    '{"v":"1","type":"auth.loggedOut","payload":{}}', // 버전이 문자열
    '{"v":1,"type":"toString","payload":{}}', // 객체 조회로 종류를 거르면 프로토타입 이름이 통과한다
    '{"__proto__":{"v":1,"type":"auth.loggedOut"}}', // Object.assign 류로 옮기면 프로토타입으로 통과한다
  ]) {
    assert.equal(parseWebToApp(raw), null, raw);
  }
});
