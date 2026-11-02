import assert from "node:assert/strict";
import { test } from "node:test";
import { loginFailureLog } from "./loginFailure.ts";

test("SDK 오류 사유가 그대로 남는다", () => {
  const log = loginFailureLog("kakao", "ios", Object.assign(new Error("ClientFailed(Unknown): An error occurred"), { code: "RNKakaoLogins" }));
  assert.equal(log.level, "warn");
  assert.equal(log.message, "app_login_failed kakao: ClientFailed(Unknown): An error occurred");
  assert.equal(log.route, "app:login:kakao");
  assert.deepEqual(log.context, { platform: "ios", code: "RNKakaoLogins", status: null });
});

test("서버 단계 실패는 상태 코드도 남는다", () => {
  const log = loginFailureLog("apple", "ios", Object.assign(new Error("invalid"), { code: "invalid", status: 401 }));
  assert.equal(log.fingerprint, "app_login_failed_apple");
  assert.deepEqual(log.context, { platform: "ios", code: "invalid", status: 401 });
});

test("긴 문구는 자르고, Error 가 아니어도 죽지 않는다", () => {
  assert.equal(loginFailureLog("kakao", "android", new Error("x".repeat(1000))).message.length, 300);
  assert.equal(loginFailureLog("kakao", "android", null).message, "app_login_failed kakao: null");
  assert.equal(loginFailureLog("kakao", "android", "문자열").message, "app_login_failed kakao: 문자열");
});
