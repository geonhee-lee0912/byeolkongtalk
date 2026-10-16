import { test } from "node:test";
import assert from "node:assert/strict";
import { APPLE_LOGIN_WEB, showAppleLogin } from "./apple-login-flag.ts";

test("기본 스위치 = 꺼짐 — 10-25 판정 전 prod 웹 화면 변화 금지(켤 때 이 테스트도 같이 고친다)", () => {
  assert.equal(APPLE_LOGIN_WEB, false);
  // 버튼(AppleLoginButton)이 실제로 부르는 모양 — 스위치 인자 없이(기본값). 기본값이 스위치와 떨어지면 위 줄만으론 못 잡는다
  assert.equal(showAppleLogin(null), false);
});

test("iOS 앱은 스위치와 상관없이 보인다(애플 지침 4.8)", () => {
  assert.equal(showAppleLogin({ version: "1.0.0", platform: "ios" }, false), true);
});

test("안드로이드 앱은 스위치와 상관없이 숨긴다(네이티브 애플 로그인이 없다)", () => {
  assert.equal(showAppleLogin({ version: "1.0.0", platform: "android" }, true), false);
});

test("웹 브라우저는 스위치를 따른다", () => {
  assert.equal(showAppleLogin(null, false), false);
  assert.equal(showAppleLogin(null, true), true);
});
