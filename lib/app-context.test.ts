import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// 앱 쪽 연결이 던지면(웹뷰 해체 중 등) 메시지는 이미 못 닿는다 — 그래도 부르는 쪽의 정리·이동(마이페이지 로그아웃·탈퇴: 저장소·고민 원문 삭제, router.replace)이 막히면 안 된다
test("postToApp — 앱 쪽 연결이 던져도 웹으로 번지지 않는다", () => {
  withBrowser(
    ANDROID_APP,
    {
      ReactNativeWebView: {
        postMessage: () => {
          throw new TypeError("bridge gone");
        },
      },
    },
    () => assert.doesNotThrow(() => postToApp("auth.loggedOut")),
  );
});

// ── 배선 계약 — 소스를 읽어 지키는 것. 주석 속 언급은 배선이 아니니 뺀다(lib/tarot/pending-draw.test.ts 와 같은 관용구) ──────────
// 위 테스트는 postToApp 자체만 잠근다. '부르는 곳'이 빠지면 타입·빌드·위 테스트가 전부 통과하고 오류도 안 난다 —
// 웹은 로그아웃됐는데 앱이 토큰을 들고 있다가 다음 실행 때 조용히 다시 로그인시킨다(실기기 확인표 3b 까지 가야 보인다)
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("마이페이지 — 로그아웃·탈퇴가 앱에 auth.loggedOut 을 한 번씩, 화면 이동 앞에서 보낸다(탈퇴는 성공 분기에서만)", () => {
  const code = stripComments(readFileSync(new URL("../app/mypage/page.tsx", import.meta.url), "utf8"));
  const CALL = 'postToApp("auth.loggedOut")';
  assert.equal(
    code.split(CALL).length - 1,
    2,
    `${CALL} 호출이 정확히 2곳(로그아웃·탈퇴)이어야 한다 — 빠지면 앱이 토큰을 남겨 다음 실행 때 조용히 재로그인, 겹치면 앱이 같은 알림을 두 번 받는다`,
  );
  const logout = code.indexOf("const handleLogout");
  const withdraw = code.indexOf("const handleWithdraw");
  assert.ok(logout >= 0 && withdraw > logout, "handleLogout·handleWithdraw 정의를 못 찾았다 — 이 계약의 기준 줄이 사라졌다면 계약도 같이 고칠 것(빈 스캔 방지)");
  const first = code.indexOf(CALL);
  const second = code.indexOf(CALL, first + 1);
  // 이동 앞이어야 하는 이유 — 평소 router.replace 는 문서를 안 바꾸지만, deploymentId(스큐 보호)가 켜진 배포에서 버전이 어긋나면 Next 16 이 하드 내비게이션(문서 교체)으로 바꾼다
  const BEFORE_NAV = "router.replace 앞에서 앱에 알려야 한다 — 버전이 어긋난 배포에선 router.replace 가 문서를 교체할 수 있다(Next 16 deploymentId)";
  // 로그아웃 — handleLogout 안, router.replace 앞
  assert.ok(first > logout && first < withdraw, "첫 호출이 handleLogout 안이 아니다");
  assert.ok(first < code.indexOf("router.replace(", logout), `로그아웃은 ${BEFORE_NAV}`);
  // 탈퇴 — 서버가 회원을 지운 뒤(if (r.ok) 분기 안)에만, router.replace 앞
  const ok = code.indexOf("if (r.ok)", withdraw);
  const otherwise = code.indexOf("} else {", ok);
  assert.ok(ok > 0 && otherwise > ok, "if (r.ok) { … } else { … } 모양을 못 찾았다");
  assert.ok(second > ok && second < otherwise, "탈퇴 알림은 if (r.ok) 분기 안에서만 — 실패(503·500)에서 나가면 회원은 남았는데 앱만 로그아웃된다");
  assert.ok(second < code.indexOf("router.replace(", ok), `탈퇴는 ${BEFORE_NAV}`);
});
