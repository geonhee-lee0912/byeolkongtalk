import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSajuMbtiShareUrl } from "./share-url.ts";

test("buildSajuMbtiShareUrl — r 토큰 + utm 파라미터", () => {
  const url = buildSajuMbtiShareUrl("https://byeolkongtalk.com", "aB3xK9", "음강재생");
  assert.match(url, /^https:\/\/byeolkongtalk\.com\/fortune\/saju-mbti\?/);
  assert.match(url, /(\?|&)r=aB3xK9(&|$)/);
  assert.match(url, /utm_source=saju_mbti/);
  assert.match(url, /utm_medium=share/);
  assert.match(url, /utm_content=/);
});

test("buildSajuMbtiShareUrl — origin 끝 슬래시 중복 없음", () => {
  const url = buildSajuMbtiShareUrl("https://x.com/", "abc", "음유재단");
  assert.equal(url.includes("//fortune"), false);
});
