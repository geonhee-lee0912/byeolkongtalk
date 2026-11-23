import { test } from "node:test";
import assert from "node:assert/strict";
import { decideNavigation, parseIntentUrl } from "./linkRules.ts";

const BASE = "https://byeolkongtalk.com";

test("우리 로그인 시작 주소 → 네이티브 로그인(next 그대로)", () => {
  assert.deepEqual(
    decideNavigation(`${BASE}/api/auth/login/kakao?next=%2Ftarot%2Fdraw%3Fresume%3Dlogin`, BASE),
    { kind: "login", provider: "kakao", next: "/tarot/draw?resume=login" },
  );
  assert.deepEqual(decideNavigation(`${BASE}/api/auth/login/apple`, BASE), { kind: "login", provider: "apple", next: "/" });
  // 웹 애플 버튼(components/auth/AppleLoginButton)이 만드는 주소 그대로 — 뽑기 시트의 next
  assert.deepEqual(
    decideNavigation(`${BASE}/api/auth/login/apple?next=%2Ftarot%2Fdraw%3Fresume%3Dlogin`, BASE),
    { kind: "login", provider: "apple", next: "/tarot/draw?resume=login" },
  );
});

test("로그인 next 가 바깥 주소면 홈으로", () => {
  assert.deepEqual(
    decideNavigation(`${BASE}/api/auth/login/kakao?next=%2F%2Fevil.example`, BASE),
    { kind: "login", provider: "kakao", next: "/" },
  );
});

test("그 밖의 우리 주소는 웹뷰 안에서(www 포함)", () => {
  assert.deepEqual(decideNavigation(`${BASE}/tarot`, BASE), { kind: "allow" });
  assert.deepEqual(decideNavigation("https://www.byeolkongtalk.com/fortune", BASE), { kind: "allow" });
  assert.deepEqual(decideNavigation(`${BASE}/api/auth/app/handoff?next=%2F&mode=login`, BASE), { kind: "allow" });
});

test("다른 http(s) 사이트는 앱 안 브라우저로 — 단 iframe 이동은 건드리지 않는다", () => {
  assert.deepEqual(decideNavigation("https://pf.kakao.com/_abc", BASE), { kind: "browser" });
  assert.deepEqual(decideNavigation("https://byeolkongtalk.com.evil.example/", BASE), { kind: "browser" });
  assert.deepEqual(decideNavigation("https://www.facebook.com/tr?id=1", BASE, { isTopFrame: false }), { kind: "allow" });
});

test("앱을 여는 유니버설 링크(카카오 SDK iOS 공유)는 OS 로 — 앱 안 브라우저로 열면 카카오톡이 안 열린다", () => {
  // 카카오 JS SDK 2.7.4 callWeb2appForTalk: URL.universalKakaoLink("https://talk-apps.kakao.com/scheme/") + encodeURIComponent(urlScheme)
  const share = "https://talk-apps.kakao.com/scheme/" + encodeURIComponent("kakaolink://send?appkey=k&linkver=4.0");
  assert.deepEqual(decideNavigation(share, BASE, { isTopFrame: true }), { kind: "os" });
  assert.deepEqual(decideNavigation(share, BASE), { kind: "os" });
  // 비슷한 호스트·사용자 정보로 꾸민 주소는 그대로 앱 안 브라우저
  assert.deepEqual(decideNavigation("https://talk-apps.kakao.com.evil.example/scheme/x", BASE), { kind: "browser" });
  assert.deepEqual(decideNavigation("https://talk-apps.kakao.com@evil.example/scheme/x", BASE), { kind: "browser" });
  assert.deepEqual(decideNavigation("https://evil.example/talk-apps.kakao.com/scheme/x", BASE), { kind: "browser" });
  // iframe 안 이동은 여전히 건드리지 않는다
  assert.deepEqual(decideNavigation(share, BASE, { isTopFrame: false }), { kind: "allow" });
});

test("앱 호출 주소는 OS 로, 엔진 내부 주소는 그대로, file:·data:·남의 blob: 과 모양 없는 값은 막는다", () => {
  for (const u of ["kakaolink://send?x=1", "kakaotalk://inappbrowser", "intent://send#Intent;scheme=kakaolink;end", "tel:0212345678", "mailto:a@b.c"]) {
    assert.deepEqual(decideNavigation(u, BASE), { kind: "os" }, u);
  }
  for (const u of ["about:blank", "blob:https://byeolkongtalk.com/1"]) {
    assert.deepEqual(decideNavigation(u, BASE), { kind: "allow" }, u);
  }
  assert.deepEqual(decideNavigation("file:///etc/passwd", BASE), { kind: "block" });
  // 최상위 data:·남의 blob: — 주소창 없는 앱 화면에 남이 만든 HTML 이 뜬다(iframe 안은 위 isTopFrame 규칙으로 그대로 둔다)
  for (const u of ["data:text/html,<h1>hi</h1>", "blob:https://evil.example/1", "blob:null/1"]) {
    assert.deepEqual(decideNavigation(u, BASE), { kind: "block" }, u);
  }
  assert.deepEqual(decideNavigation("data:text/html,<h1>hi</h1>", BASE, { isTopFrame: false }), { kind: "allow" });
  assert.deepEqual(decideNavigation("no-scheme", BASE), { kind: "block" });
});

test("intent: — 카카오톡 공유 주소를 scheme 주소와 대체 주소로", () => {
  assert.deepEqual(
    parseIntentUrl("intent://send?appkey=k&linkver=4.0#Intent;scheme=kakaolink;package=com.kakao.talk;end"),
    { primary: "kakaolink://send?appkey=k&linkver=4.0", fallback: "market://details?id=com.kakao.talk" },
  );
  assert.deepEqual(
    parseIntentUrl("intent://x#Intent;scheme=foo;S.browser_fallback_url=https%3A%2F%2Fexample.com%2Fy;end"),
    { primary: "foo://x", fallback: "https://example.com/y" },
  );
  assert.deepEqual(parseIntentUrl("intent://x"), { primary: null, fallback: null });
  assert.equal(parseIntentUrl("https://byeolkongtalk.com"), null);
});

test("intent: — 대체 주소는 http(s) 만(javascript:·intent: 는 버리고 마켓으로)", () => {
  assert.deepEqual(
    parseIntentUrl("intent://x#Intent;scheme=foo;package=com.kakao.talk;S.browser_fallback_url=javascript%3Aalert(1);end"),
    { primary: "foo://x", fallback: "market://details?id=com.kakao.talk" },
  );
  assert.deepEqual(
    parseIntentUrl("intent://x#Intent;scheme=foo;S.browser_fallback_url=intent%3A%2F%2Fy%23Intent%3Bend;end"),
    { primary: "foo://x", fallback: null },
  );
});
