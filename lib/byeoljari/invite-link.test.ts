import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInviteUrl } from "./invite-link.ts";

test("buildInviteUrl — utm 파라미터를 붙인다", () => {
  const url = buildInviteUrl("https://byeolkongtalk.com", "aB3xK9zQ1p");
  assert.equal(
    url,
    "https://byeolkongtalk.com/fortune/byeoljari/aB3xK9zQ1p?utm_source=byeoljari&utm_medium=invite&utm_content=aB3xK9zQ1p"
  );
});

test("buildInviteUrl — origin 끝 슬래시 중복 없음", () => {
  const url = buildInviteUrl("https://byeolkongtalk.com/", "abc");
  assert.equal(url.startsWith("https://byeolkongtalk.com/fortune/byeoljari/abc?"), true);
  assert.equal(url.includes("//fortune"), false);
});

test("buildInviteUrl — utm_content 는 shareId (맵 귀속)", () => {
  const url = buildInviteUrl("https://x.com", "MAP123");
  assert.match(url, /utm_content=MAP123/);
});
