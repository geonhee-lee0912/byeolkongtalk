import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBrowserEnv, isBotUserAgent, normalizePath } from "./pageview.ts";

test("isBotUserAgent — UA 없으면 봇 취급", () => {
  assert.equal(isBotUserAgent(null), true);
  assert.equal(isBotUserAgent(""), true);
  assert.equal(isBotUserAgent(undefined), true);
});

test("isBotUserAgent — 일반 모바일 브라우저는 통과", () => {
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  assert.equal(isBotUserAgent(ua), false);
});

test("isBotUserAgent — 스크래퍼·크롤러는 차단", () => {
  assert.equal(isBotUserAgent("facebookexternalhit/1.1"), true);
  assert.equal(isBotUserAgent("Googlebot/2.1"), true);
  assert.equal(isBotUserAgent("curl/8.4.0"), true);
  assert.equal(isBotUserAgent("HeadlessChrome/120.0"), true);
});

// 광고 유입이 주 트래픽이라 카카오톡·인스타·페북·네이버 인앱 브라우저가 핵심 세그먼트다.
// 봇 regex 에 토큰을 추가할 때 이들이 봇으로 걸리면 UV 가 통째로 사라지므로 회귀를 잠근다.
test("isBotUserAgent — 국내 인앱 브라우저는 봇 아님", () => {
  const inApp = {
    kakaotalk:
      "Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.3",
    instagram:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113 (iPhone14,3; iOS 17_0; ko_KR; ko)",
    facebook:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.35.111;FBDV/iPhone14,3;FBMD/iPhone;FBSN/iOS;FBSV/17.0]",
    naver:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.5.1)",
  };
  for (const [name, ua] of Object.entries(inApp)) {
    assert.equal(isBotUserAgent(ua), false, `${name} 인앱이 봇으로 오탐됨`);
  }
});

test("normalizePath — 비-string 입력은 null", () => {
  // 프로덕션 실입력은 body.path: unknown 이고 typeof 검사가 유일한 방어선이다
  assert.equal(normalizePath(null), null);
  assert.equal(normalizePath(undefined), null);
  assert.equal(normalizePath(123), null);
  assert.equal(normalizePath({}), null);
});

test("normalizePath — 쿼리·해시 제거", () => {
  assert.equal(normalizePath("/tarot/reading?id=abc&x=1"), "/tarot/reading");
  assert.equal(normalizePath("/shop#top"), "/shop");
});

test("normalizePath — UUID·긴 숫자 세그먼트는 :id 로 치환", () => {
  assert.equal(normalizePath("/readings/3f2a1b4c-5d6e-7f80-9012-3456789abcde"), "/readings/:id");
  assert.equal(normalizePath("/readings/1234567"), "/readings/:id");
});

test("normalizePath — 루트 유지", () => {
  assert.equal(normalizePath("/"), "/");
});

test("normalizePath — 슬래시로 시작하지 않으면 null", () => {
  assert.equal(normalizePath("bad"), null);
  assert.equal(normalizePath(""), null);
});

test("normalizePath — 200자로 cap", () => {
  const long = "/" + "a".repeat(500);
  assert.equal(normalizePath(long)!.length, 200);
});

test("normalizePath — byeoljari 공유 랜딩은 :shareId 로 접힌다", () => {
  assert.equal(normalizePath("/fortune/byeoljari/aB3xK9zQ1p"), "/fortune/byeoljari/:shareId");
  assert.equal(normalizePath("/fortune/byeoljari/MAP123?x=1"), "/fortune/byeoljari/:shareId");
});

test("normalizePath — byeoljari 만들기 경로는 그대로", () => {
  assert.equal(normalizePath("/fortune/byeoljari"), "/fortune/byeoljari");
});

// 광고 유입의 99.6% 가 인앱 브라우저(Meta 콘솔 '앱 내')인데, 로그인 게이트에서 30.8% 가 이탈한다.
// 원인이 인앱 브라우저의 카카오 OAuth 마찰인지 판별하려면 환경을 남겨야 한다.
// ⚠️ inapp 을 하나로 뭉치면 신호가 죽는다 — 카카오톡 인앱은 카카오 로그인이 가장 잘 붙는 최선 케이스고
//    인스타 인앱이 최악이라, 둘을 합치면 비교군이 사라진다.
test("detectBrowserEnv — 인앱 앱별로 구분한다", () => {
  assert.equal(
    detectBrowserEnv(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113 (iPhone14,3; iOS 17_0; ko_KR; ko)",
    ),
    "ig",
  );
  assert.equal(
    detectBrowserEnv(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.35.111;FBDV/iPhone14,3]",
    ),
    "fb",
  );
  assert.equal(
    detectBrowserEnv(
      "Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.3",
    ),
    "kakao",
  );
  assert.equal(
    detectBrowserEnv(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.5.1)",
    ),
    "other_inapp",
  );
});

test("detectBrowserEnv — 일반 브라우저는 browser", () => {
  assert.equal(
    detectBrowserEnv(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ),
    "browser",
  );
  assert.equal(
    detectBrowserEnv(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ),
    "browser",
  );
});

test("detectBrowserEnv — UA 없으면 null (추측하지 않는다)", () => {
  assert.equal(detectBrowserEnv(null), null);
  assert.equal(detectBrowserEnv(""), null);
  assert.equal(detectBrowserEnv(undefined), null);
});

// Threads 는 Instagram 계열이지만 UA 에 Barcelona 로 찍힌다(지출 4% 차지).
test("detectBrowserEnv — Threads(Barcelona) 는 ig 로 접는다", () => {
  assert.equal(
    detectBrowserEnv(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 325.0.0.25.108",
    ),
    "ig",
  );
});
