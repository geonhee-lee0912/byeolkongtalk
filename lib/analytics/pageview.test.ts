import { test } from "node:test";
import assert from "node:assert/strict";
import { isBotUserAgent, normalizePath } from "./pageview.ts";

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
