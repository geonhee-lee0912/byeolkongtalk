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
