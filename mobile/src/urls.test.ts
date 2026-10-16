import { test } from "node:test";
import assert from "node:assert/strict";
import { handoffSource, isOurUrl, queryParam, resetUrl, safeAppPath, withVercelBypass } from "./urls.ts";

const BASE = "https://byeolkongtalk.com";

test("isOurUrl — 같은 scheme·host 와 www 만 우리 주소", () => {
  assert.equal(isOurUrl("https://byeolkongtalk.com", BASE), true);
  assert.equal(isOurUrl("https://byeolkongtalk.com/tarot?x=1", BASE), true);
  assert.equal(isOurUrl("https://www.byeolkongtalk.com/", BASE), true);
  assert.equal(isOurUrl("https://BYEOLKONGTALK.com/a", BASE), true);
  assert.equal(isOurUrl("http://byeolkongtalk.com/", BASE), false);
  assert.equal(isOurUrl("https://byeolkongtalk.com.evil.example/", BASE), false);
  assert.equal(isOurUrl("https://byeolkongtalk.com@evil.example/", BASE), false);
  assert.equal(isOurUrl("https://dev.byeolkongtalk.com/", BASE), false);
  assert.equal(isOurUrl("kakaolink://send", BASE), false);
});

test("queryParam — 값 하나를 꺼내 디코딩, 없거나 깨지면 null", () => {
  assert.equal(queryParam("/api/auth/login/kakao?next=%2Ftarot%2Fdraw%3Fresume%3Dlogin", "next"), "/tarot/draw?resume=login");
  assert.equal(queryParam("/x?a=1&b=two+words#h", "b"), "two words");
  assert.equal(queryParam("/x?a=1#next=/evil", "next"), null);
  assert.equal(queryParam("/x", "next"), null);
  assert.equal(queryParam("/x?next=%E0%A4%A", "next"), null);
});

test("safeAppPath — 내부 경로만", () => {
  assert.equal(safeAppPath("/tarot/draw?resume=login"), "/tarot/draw?resume=login");
  assert.equal(safeAppPath("/"), "/");
  assert.equal(safeAppPath("/a?x=../y"), "/a?x=../y");
  for (const bad of ["", "tarot", "//evil.example", "/\\evil.example", "https://evil.example", "/a/../b", "/./a", "/a b", "/a\nb", `/${"a".repeat(500)}`, null, undefined]) {
    assert.equal(safeAppPath(bad as string | null | undefined), null, String(bad));
  }
});

test("handoff — 교환 코드는 주소가 아니라 헤더로(서버는 주소의 code 를 보지 않는다), next 는 인코딩 · reset 주소", () => {
  assert.deepEqual(handoffSource(BASE, "c+d/e", "/tarot/draw?resume=login", "login"), {
    uri: "https://byeolkongtalk.com/api/auth/app/handoff?next=%2Ftarot%2Fdraw%3Fresume%3Dlogin&mode=login",
    headers: { "X-Byeolkong-Handoff": "c+d/e" },
  });
  assert.equal(resetUrl(BASE, "/"), "https://byeolkongtalk.com/api/auth/app/reset?next=%2F");
});

test("handoff — 개발용 빌드(우회 값): 우회는 헤더로만 달아 리다이렉트 없이 우리 라우트에 닿고, 우회 쿠키는 next 이동에서 심는다", () => {
  assert.deepEqual(handoffSource("https://dev.x", "c1", "/", "launch", "s3"), {
    uri: "https://dev.x/api/auth/app/handoff?next=%2F%3Fx-vercel-protection-bypass%3Ds3%26x-vercel-set-bypass-cookie%3Dtrue&mode=launch",
    headers: { "X-Byeolkong-Handoff": "c1", "x-vercel-protection-bypass": "s3" },
  });
});

test("withVercelBypass — 값이 있을 때만, 해시 앞에 붙인다", () => {
  assert.equal(withVercelBypass("https://dev.x/a", null), "https://dev.x/a");
  assert.equal(
    withVercelBypass("https://dev.x/a?b=1#h", "s3"),
    "https://dev.x/a?b=1&x-vercel-protection-bypass=s3&x-vercel-set-bypass-cookie=true#h",
  );
  assert.equal(
    withVercelBypass("https://dev.x/", "s3"),
    "https://dev.x/?x-vercel-protection-bypass=s3&x-vercel-set-bypass-cookie=true",
  );
});
