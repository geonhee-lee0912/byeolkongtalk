import { test } from "node:test";
import assert from "node:assert/strict";
import { loginFailRedirectUrl } from "./auth-redirect.ts";

const BASE = "https://byeolkongtalk.com";

test("뽑기 이어가기로 가던 로그인 실패 → 그 화면으로(이어가기 표시 유지) + login=fail·reason", () => {
  const u = loginFailRedirectUrl("/tarot/draw?resume=login", "csrf_state_mismatch", BASE);
  assert.equal(u.pathname, "/tarot/draw");
  assert.equal(u.searchParams.get("resume"), "login");
  assert.equal(u.searchParams.get("login"), "fail");
  assert.equal(u.searchParams.get("reason"), "csrf_state_mismatch");
  assert.equal(loginFailRedirectUrl("/tarot/draw", "access_denied", BASE).pathname, "/tarot/draw");
});

test("그 밖(옛 흐름 /concern 등)은 지금처럼 홈 — 대조군 불변", () => {
  for (const next of ["/concern", "/", "/start?v=love", "/tarot/drawing", "/tarot"]) {
    const u = loginFailRedirectUrl(next, "no_code", BASE);
    assert.equal(u.pathname, "/", next);
    assert.equal(u.search, "?login=fail&reason=no_code", next);
  }
});

test("회귀차단: next 가 안 걸러진 값이어도 결과는 항상 baseUrl 의 origin — 외부로 못 나간다", () => {
  for (const next of [
    "//evil.example/tarot/draw?resume=login",
    "https://evil.example/tarot/draw?resume=login",
    "/\\evil.example",
    "/tarot/draw?resume=login&next=//evil.example",
    "/tarot/draw?resume=login#//evil.example",
  ]) {
    assert.equal(loginFailRedirectUrl(next, "x", BASE).origin, BASE, next);
  }
});

test("next 에 이미 login·reason 이 붙어 있어도 덮어쓴다 — login=fail 하나 · reason=<새 값> 하나(덧붙지 않는다)", () => {
  // 한 번 실패하고 돌아온 주소(?login=fail&reason=…)에서 다시 로그인해 또 실패해도, 이어가기 표시만 남기고 최신 실패만 싣는다
  const u = loginFailRedirectUrl("/tarot/draw?resume=login&login=success&reason=old_reason&login=fail", "csrf_state_mismatch", BASE);
  assert.equal(u.pathname, "/tarot/draw");
  assert.deepEqual(u.searchParams.getAll("login"), ["fail"]);
  assert.deepEqual(u.searchParams.getAll("reason"), ["csrf_state_mismatch"]);
  assert.equal(u.searchParams.get("resume"), "login"); // 이어가기 표시는 그대로
  // 홈으로 가는 쪽은 next 의 쿼리를 아예 안 가져간다
  const home = loginFailRedirectUrl("/concern?login=success&reason=old_reason", "no_code", BASE);
  assert.equal(home.search, "?login=fail&reason=no_code");
});
