import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appleAuthorizeUrl,
  appleRedirectUri,
  parseAppleState,
  parseAppleUserName,
  renderAutoPostForm,
} from "./apple-web.ts";

test("인증 주소 — form_post · code id_token(공백은 %20) · scope=name · state · nonce · 돌아올 주소", () => {
  const url = appleAuthorizeUrl({
    servicesId: "com.byeolkongtalk.web",
    redirectUri: appleRedirectUri("https://byeolkongtalk.com"),
    state: "n|/a?b=1",
    nonce: "abc",
  });
  assert.ok(url.startsWith("https://appleid.apple.com/auth/authorize?"));
  assert.match(url, /client_id=com\.byeolkongtalk\.web/);
  assert.match(url, /redirect_uri=https%3A%2F%2Fbyeolkongtalk\.com%2Fapi%2Fauth%2Fapple%2Fcallback/);
  assert.match(url, /response_type=code%20id_token/);
  assert.match(url, /response_mode=form_post/);
  assert.match(url, /scope=name(&|$)/);
  assert.match(url, /state=n%7C%2Fa%3Fb%3D1/);
  assert.match(url, /nonce=abc/);
});

test("돌아올 주소 — 기준 주소 끝 슬래시를 정리한다", () => {
  assert.equal(appleRedirectUri("https://dev.byeolkongtalk.com/"), "https://dev.byeolkongtalk.com/api/auth/apple/callback");
});

test("state 해석 — nonce|next, 구분자가 없으면 next=/", () => {
  assert.deepEqual(parseAppleState(`${"a".repeat(32)}|/tarot/draw?resume=login`), { nonce: "a".repeat(32), next: "/tarot/draw?resume=login" });
  assert.deepEqual(parseAppleState("abc"), { nonce: "abc", next: "/" });
});

test("user 필드 — 이름만 꺼내고, 이상하면 null", () => {
  assert.deepEqual(parseAppleUserName('{"name":{"firstName":"별콩","lastName":"김"},"email":"x@y.z"}'), {
    givenName: "별콩",
    familyName: "김",
  });
  assert.equal(parseAppleUserName(""), null);
  assert.equal(parseAppleUserName(null), null);
  assert.equal(parseAppleUserName("not json"), null);
  assert.equal(parseAppleUserName('{"email":"x@y.z"}'), null);
});

test("자동 제출 폼 — 값의 따옴표·꺾쇠·& 를 이스케이프해 태그를 깨지 못한다", () => {
  const html = renderAutoPostForm("/api/auth/apple/complete", {
    user: '"><script>alert(1)</script>',
    state: "a|/b?c=1&d=2",
  });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
  assert.ok(html.includes('value="a|/b?c=1&amp;d=2"'));
  assert.ok(html.includes('action="/api/auth/apple/complete"'));
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
});
