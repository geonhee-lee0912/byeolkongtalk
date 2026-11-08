import { test } from "node:test";
import assert from "node:assert/strict";
import { loginFailRedirectUrl } from "./auth-redirect.ts";

const BASE = "https://byeolkongtalk.com";

test("로그인 실패는 늘 홈 + login=fail·reason", () => {
  const u = loginFailRedirectUrl("csrf_state_mismatch", BASE);
  assert.equal(u.origin, BASE);
  assert.equal(u.pathname, "/");
  assert.equal(u.search, "?login=fail&reason=csrf_state_mismatch");
});

test("reason 은 쿼리 값으로만 실린다 — 경로·출처를 못 바꾼다", () => {
  const u = loginFailRedirectUrl("x&login=success#//evil.example", BASE);
  assert.equal(u.origin, BASE);
  assert.equal(u.pathname, "/");
  assert.deepEqual(u.searchParams.getAll("login"), ["fail"]);
  assert.equal(u.searchParams.get("reason"), "x&login=success#//evil.example");
});
