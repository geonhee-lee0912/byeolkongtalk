import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { httpsProfileImg } from "./profile-img.ts";

test("카카오 CDN 의 http 주소는 https 로(나머지는 그대로)", () => {
  assert.equal(httpsProfileImg("http://k.kakaocdn.net/dn/abc/img_640x640.jpg"), "https://k.kakaocdn.net/dn/abc/img_640x640.jpg");
  assert.equal(httpsProfileImg("http://img1.kakaocdn.net/thumb/R640x640.q70/?fname=x"), "https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=x");
  assert.equal(httpsProfileImg("HTTP://K.KAKAOCDN.NET/dn/a.jpg"), "https://K.KAKAOCDN.NET/dn/a.jpg");
});

test("이미 https·빈 값·카카오 CDN 이 아닌 주소는 건드리지 않는다", () => {
  assert.equal(httpsProfileImg("https://k.kakaocdn.net/dn/a.jpg"), "https://k.kakaocdn.net/dn/a.jpg");
  assert.equal(httpsProfileImg(null), null);
  assert.equal(httpsProfileImg(""), "");
  assert.equal(httpsProfileImg("http://example.com/a.jpg"), "http://example.com/a.jpg");
  // 호스트 끝이 kakaocdn.net 인 척하는 다른 호스트
  assert.equal(httpsProfileImg("http://kakaocdn.net.evil.example/a.jpg"), "http://kakaocdn.net.evil.example/a.jpg");
  assert.equal(httpsProfileImg("http://evilkakaocdn.net/a.jpg"), "http://evilkakaocdn.net/a.jpg");
});

// ── 배선 계약 — 헤더·마이·우리 사이 화면의 프로필 사진은 전부 /api/auth/me 가 내려준 값이다. 여기서 빠지면 타입·빌드·위 테스트가 다 통과하고
//    웹(브라우저가 https 로 올려 보여 준다)에서도 멀쩡해 앱(안드로이드 웹뷰)에서만 사진이 깨진다 ─────────────────────────────
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("/api/auth/me — 프로필 사진 주소를 httpsProfileImg 로 바꿔 내려준다", () => {
  const code = stripComments(readFileSync(new URL("../../app/api/auth/me/route.ts", import.meta.url), "utf8"));
  assert.match(code, /profile_img:\s*httpsProfileImg\(row\.profile_img\)/);
});
