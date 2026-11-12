import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowWelcomePopup } from "./welcome-popup.ts";
import { WELCOME_BONUS_STARS } from "./constants.ts";

// 웰컴 별 팝업(가입 직후 1회)을 /start 밖 — 앱·웹 어느 화면으로 돌아와도 — 띄우는 조건.
// welcome=1 은 "새 회원"이지 "별을 받았다"가 아니다: 탈퇴 뒤 같은 수단으로 재가입하면
// 새 회원이지만 웰컴 별은 막힌다(bonus_claims). 그 사람에게 "도착"이라 말하지 않게 실제 잔액으로 가른다.

const base = { login: "success", welcome: "1", pathname: "/", balance: WELCOME_BONUS_STARS };

test("가입 직후 + 웰컴 별이 들어온 잔액 → 띄운다", () => {
  assert.equal(shouldShowWelcomePopup(base), true);
  assert.equal(shouldShowWelcomePopup({ ...base, pathname: "/fortune" }), true);
});

test("기존 회원 재로그인(welcome 없음) → 안 띄운다", () => {
  assert.equal(shouldShowWelcomePopup({ ...base, welcome: null }), false);
});

test("로그인 복귀가 아니면 welcome 이 붙어 있어도 안 띄운다", () => {
  assert.equal(shouldShowWelcomePopup({ ...base, login: null }), false);
});

test("재가입이라 웰컴 별이 막혀 잔액 0 → 안 띄운다", () => {
  assert.equal(shouldShowWelcomePopup({ ...base, balance: 0 }), false);
});

test("잔액을 못 읽었으면(null) 안 띄운다 — 틀린 '도착'보다 안 보이는 게 낫다", () => {
  assert.equal(shouldShowWelcomePopup({ ...base, balance: null }), false);
});

test("/start 는 자기 팝업을 쓴다 → 여기선 안 띄운다(두 번 뜨지 않게)", () => {
  assert.equal(shouldShowWelcomePopup({ ...base, pathname: "/start" }), false);
});
