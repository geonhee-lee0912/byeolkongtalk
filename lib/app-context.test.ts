import { test } from "node:test";
import assert from "node:assert/strict";
import { getAppInfo, postToApp } from "./app-context.ts";
import { parseWebToApp } from "./app-bridge/protocol.ts";

/**
 * getAppInfo·postToApp 은 window·navigator 전역에 의존한다. node:test 엔 window 가 없고 navigator.userAgent 는 "Node.js/<버전>" 이라
 * 최소 스텁을 심고 finally 로 반드시 원복한다(다른 테스트로 새지 않게 — lib/consultation-entry.test.ts 와 같은 방식).
 */
function withBrowser(ua: string, win: Record<string, unknown>, fn: () => void) {
  const KEYS = ["window", "navigator"] as const;
  const saved = KEYS.map((k) => Object.getOwnPropertyDescriptor(globalThis, k));
  Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: ua }, configurable: true, writable: true });
  try {
    fn();
  } finally {
    KEYS.forEach((k, i) => {
      const desc = saved[i];
      if (desc) Object.defineProperty(globalThis, k, desc);
      else Reflect.deleteProperty(globalThis, k);
    });
  }
}

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_APP =
  "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 ByeolkongApp/1.2.3 (android)";

test("getAppInfo — 서버(window 없음)에선 늘 null", () => {
  assert.equal(getAppInfo(), null);
});

test("getAppInfo — 앱이 주입한 값이 UA 보다 먼저, 모양이 틀린 주입 값은 버리고 UA 로", () => {
  withBrowser(ANDROID_APP, { __BYEOLKONG_APP__: { version: "9.9.9", platform: "ios" } }, () =>
    assert.deepEqual(getAppInfo(), { version: "9.9.9", platform: "ios" }),
  );
  withBrowser(ANDROID_APP, { __BYEOLKONG_APP__: { version: "9.9.9", platform: "web" } }, () =>
    assert.deepEqual(getAppInfo(), { version: "1.2.3", platform: "android" }),
  );
  // 주입이 늦거나 빠져도(안드로이드) UA 만으로 앱이다
  withBrowser(ANDROID_APP, {}, () => assert.deepEqual(getAppInfo(), { version: "1.2.3", platform: "android" }));
});

test("getAppInfo — 일반 브라우저는 null", () => {
  withBrowser(SAFARI, {}, () => assert.equal(getAppInfo(), null));
});

// 이 메시지가 앱에 안 닿으면 웹에서 로그아웃해도 앱이 토큰을 들고 있다가 다음 실행 때 조용히 다시 로그인시킨다(오류 0)
test("postToApp — 앱 웹뷰(window.ReactNativeWebView)에 앱이 읽는 모양 그대로 한 번 보낸다", () => {
  const sent: string[] = [];
  withBrowser(ANDROID_APP, { ReactNativeWebView: { postMessage: (m: string) => void sent.push(m) } }, () =>
    postToApp("auth.loggedOut"),
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(parseWebToApp(sent[0]), { v: 1, type: "auth.loggedOut", payload: {} });
});

test("postToApp — 서버·일반 브라우저에선 아무것도 안 하고 던지지도 않는다", () => {
  assert.doesNotThrow(() => postToApp("auth.loggedOut"));
  withBrowser(SAFARI, {}, () => assert.doesNotThrow(() => postToApp("auth.loggedOut")));
});
