import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_EVENT,
  APP_UA_TOKEN,
  HANDOFF_CODE_HEADER,
  appUserAgentSuffix,
  APP_TAB_ROOTS,
  encodeAppToWeb,
  encodeAppToWebBack,
  encodeWebToApp,
  encodeWebToAppWith,
  hasCap,
  isAppTabRoot,
  isAppInfo,
  parseAppToWeb,
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

test("교환 코드 헤더 이름 고정 — 현장의 옛 앱이 이 이름으로 보낸다", () => {
  assert.equal(HANDOFF_CODE_HEADER, "X-Byeolkong-Handoff");
});

test("푸시 메시지 3종이 왕복한다", () => {
  for (const t of ["push.status", "push.request", "push.openSettings"] as const)
    assert.deepEqual(parseWebToApp(encodeWebToApp(t)), { v: 1, type: t, payload: {} });
});

test("caps 없는 옛 앱은 push 기능이 없다", () => {
  assert.equal(hasCap({ version: "1.0.0", platform: "ios" }, "push"), false);
  assert.equal(hasCap({ version: "1.1.0", platform: "ios", caps: ["push"] }, "push"), true);
  assert.equal(hasCap(null, "push"), false);
});

test("isAppInfo 는 caps 가 있어도 받는다", () => {
  assert.equal(isAppInfo({ version: "1", platform: "android", caps: ["push"] }), true);
});

test("앱→웹 상태 왕복과 이상한 값 거절", () => {
  assert.equal(APP_EVENT, "byeolkong:app");
  assert.deepEqual(parseAppToWeb(encodeAppToWeb("denied")), { v: 1, type: "push.state", state: "denied" });
  assert.deepEqual(parseAppToWeb({ v: 1, type: "push.state", state: "granted", extra: 1 }), { v: 1, type: "push.state", state: "granted" });
  assert.equal(parseAppToWeb('{"v":1,"type":"push.state","state":"yes"}'), null);
  assert.equal(parseAppToWeb('{"v":2,"type":"push.state","state":"granted"}'), null);
  assert.equal(parseAppToWeb('{"v":1,"type":"push.state","state":"toString"}'), null);
  assert.equal(parseAppToWeb("{"), null);
  assert.equal(parseAppToWeb(42), null);
  assert.equal(parseAppToWeb(null), null);
});

test("ui.overlay 왕복 — open 만 살아남는다", () => {
  assert.deepEqual(parseWebToApp(encodeWebToAppWith("ui.overlay", { open: true })), { v: 1, type: "ui.overlay", payload: { open: true } });
  assert.deepEqual(parseWebToApp('{"v":1,"type":"ui.overlay","payload":{"open":false,"x":1}}'), {
    v: 1,
    type: "ui.overlay",
    payload: { open: false },
  });
});

test("ui.overlay open 이 boolean 이 아니면 버린다", () => {
  for (const raw of [
    '{"v":1,"type":"ui.overlay","payload":{"open":"true"}}',
    '{"v":1,"type":"ui.overlay","payload":{"open":1}}',
    '{"v":1,"type":"ui.overlay","payload":{}}',
    '{"v":1,"type":"ui.overlay"}',
  ])
    assert.equal(parseWebToApp(raw), null, raw);
});

test("ui.haptic kind 는 light·success 만", () => {
  assert.deepEqual(parseWebToApp(encodeWebToAppWith("ui.haptic", { kind: "success" })), { v: 1, type: "ui.haptic", payload: { kind: "success" } });
  assert.equal(parseWebToApp('{"v":1,"type":"ui.haptic","payload":{"kind":"heavy"}}'), null);
  assert.equal(parseWebToApp('{"v":1,"type":"ui.haptic","payload":{"kind":"toString"}}'), null);
});

test("ui.refresh 는 payload 없이", () => {
  assert.deepEqual(parseWebToApp(encodeWebToApp("ui.refresh")), { v: 1, type: "ui.refresh", payload: {} });
  assert.deepEqual(parseWebToApp('{"v":1,"type":"ui.refresh","payload":{"url":"x"}}'), { v: 1, type: "ui.refresh", payload: {} });
});

test("앱→웹 ui.back 왕복, push.state 그대로", () => {
  assert.deepEqual(parseAppToWeb(encodeAppToWebBack()), { v: 1, type: "ui.back" });
  assert.deepEqual(parseAppToWeb({ v: 1, type: "ui.back", extra: 1 }), { v: 1, type: "ui.back" });
  assert.equal(parseAppToWeb('{"v":2,"type":"ui.back"}'), null);
  assert.deepEqual(parseAppToWeb(encodeAppToWeb("granted")), { v: 1, type: "push.state", state: "granted" });
});

test("hasCap ui — caps 에 ui 가 있을 때만", () => {
  assert.equal(hasCap({ version: "1.1.0", platform: "android", caps: ["push"] }, "ui"), false);
  assert.equal(hasCap({ version: "1.2.0", platform: "android", caps: ["push", "ui"] }, "ui"), true);
});

test("isAppTabRoot — 5개만, 끝 슬래시·쿼리 무시", () => {
  assert.deepEqual([...APP_TAB_ROOTS], ["/", "/fortune", "/byeolmaru", "/shop", "/mypage"]);
  for (const p of ["/", "/shop/", "/?tab=1", "/mypage#x", "/fortune"]) assert.equal(isAppTabRoot(p), true, p);
  for (const p of ["/shop/x", "/fortune/love_year", "/tarot/draw", "", "shop"]) assert.equal(isAppTabRoot(p), false, p);
});
