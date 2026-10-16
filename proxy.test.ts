// proxy.ts 의 익명 쿠키(byeolkong_anon_id) 발급 — 웹 애플 로그인 콜백만 예외다(lib/auth/apple-web.ts).
// 애플 form_post 는 교차 사이트 POST 라 Lax 쿠키가 안 실려 와 '쿠키 없음'으로 보이지만 브라우저엔 anon 이 있다. 거기서 새로 심으면
// 교차 사이트 '최상위' 이동의 응답이라 브라우저가 저장해 기존 anon 을 덮어쓴다 — 가입 뒤 별자리 지도 승계·유입 복구·입구 반반 그룹이 끊긴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "./proxy.ts";
import { appleRedirectUri } from "./lib/auth/apple-web.ts";

const BASE = "https://byeolkongtalk.com";
const anonSetCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("byeolkong_anon_id="));
const formPost = (url: string, cookie?: string) =>
  new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
    body: "state=s&id_token=t",
  });

test("애플 콜백(애플이 보내는 교차 사이트 POST — 쿠키가 안 실린다) — 익명 쿠키를 새로 심지 않는다", async () => {
  // 주소는 애플에 등록하는 돌아올 주소 그대로 — 콜백 경로가 바뀌면 이 예외도 같이 옮겨야 한다
  const res = await proxy(formPost(appleRedirectUri(BASE)));
  assert.equal(anonSetCookie(res), undefined);
});

test("그 밖의 첫 진입 — 익명 쿠키를 심는다(HttpOnly · SameSite=lax · 1년). 예외는 콜백 하나뿐", async () => {
  for (const req of [new NextRequest(`${BASE}/`), formPost(`${BASE}/api/auth/apple/complete`), new NextRequest(`${BASE}/api/auth/kakao?code=c`)]) {
    const c = anonSetCookie(await proxy(req));
    assert.ok(c, req.url);
    assert.match(c, /HttpOnly/i, req.url);
    assert.match(c, /SameSite=lax/i, req.url);
    assert.match(c, /Max-Age=31536000/, req.url);
  }
});

test("이미 익명 쿠키가 있으면 그대로 둔다", async () => {
  for (const url of [`${BASE}/`, `${BASE}/api/auth/apple/complete`]) {
    const res = await proxy(url.endsWith("/") ? new NextRequest(url, { headers: { cookie: "byeolkong_anon_id=a1" } }) : formPost(url, "byeolkong_anon_id=a1"));
    assert.equal(anonSetCookie(res), undefined, url);
  }
});
