import { test } from "node:test";
import assert from "node:assert/strict";
import { STAR_PACKAGES } from "./constants.ts";
import {
  receivedStars,
  pickDefaultPackage,
  leftoverAfter,
  parseNeedParam,
  firstChargeBonusPercent,
} from "./recharge-default.ts";

// 시트(RechargeSheet INCHAT_PACKAGES)와 같은 3종
const SHEET = STAR_PACKAGES.filter((p) => ["star_10", "star_30", "star_70"].includes(p.id));
const SHOP = STAR_PACKAGES;
const pkg = (id: string) => STAR_PACKAGES.find((p) => p.id === id)!;

test("receivedStars — 보너스 자격이면 +20% 반올림(화면 표시와 같은 Math.round)", () => {
  assert.equal(receivedStars(pkg("star_10"), false), 10);
  assert.equal(receivedStars(pkg("star_10"), true), 12);
  assert.equal(receivedStars(pkg("star_30"), true), 36);
  assert.equal(receivedStars(pkg("star_70"), true), 84);
});

test("pickDefaultPackage — 모르거나 부족하지 않으면 null(화면 기존 기본값 유지)", () => {
  assert.equal(pickDefaultPackage({ need: null, balance: 5, bonusEligible: false, packages: SHEET }), null);
  assert.equal(pickDefaultPackage({ need: 15, balance: null, bonusEligible: false, packages: SHEET }), null);
  assert.equal(pickDefaultPackage({ need: 15, balance: 15, bonusEligible: false, packages: SHEET }), null);
  assert.equal(pickDefaultPackage({ need: 15, balance: 20, bonusEligible: false, packages: SHEET }), null);
});

test("pickDefaultPackage — 보너스 없음: 최소 충분 패키지의 한 단계 위, star_70 상한", () => {
  const pick = (shortfall: number, packages = SHEET) =>
    pickDefaultPackage({ need: 100 + shortfall, balance: 100, bonusEligible: false, packages });
  assert.equal(pick(1), "star_30");
  assert.equal(pick(5), "star_30");
  assert.equal(pick(10), "star_30");
  assert.equal(pick(11), "star_70");
  assert.equal(pick(30), "star_70");
  assert.equal(pick(31), "star_70"); // min 이 star_70 → 상한 그대로
  assert.equal(pick(70), "star_70");
});

test("pickDefaultPackage — 보너스 자격: 받는 별(12/36/84) 기준", () => {
  const pick = (shortfall: number) =>
    pickDefaultPackage({ need: 100 + shortfall, balance: 100, bonusEligible: true, packages: SHEET });
  assert.equal(pick(12), "star_30");
  assert.equal(pick(13), "star_70");
  assert.equal(pick(36), "star_70");
  assert.equal(pick(37), "star_70");
});

test("pickDefaultPackage — 상한은 최소 충분 패키지보다 작아지지 않는다(/shop 5종)", () => {
  const pick = (shortfall: number) =>
    pickDefaultPackage({ need: 100 + shortfall, balance: 100, bonusEligible: false, packages: SHOP });
  assert.equal(pick(5), "star_30");
  assert.equal(pick(20), "star_70");
  assert.equal(pick(71), "star_150"); // star_70 로는 못 덮음 → min
  assert.equal(pick(151), "star_300");
});

test("pickDefaultPackage — 어느 것도 못 덮으면 목록의 가장 큰 패키지", () => {
  assert.equal(pickDefaultPackage({ need: 200, balance: 0, bonusEligible: false, packages: SHEET }), "star_70");
  assert.equal(pickDefaultPackage({ need: 999, balance: 0, bonusEligible: false, packages: SHOP }), "star_300");
});

test("pickDefaultPackage — 패키지 순서와 무관(별 수로 정렬)", () => {
  const reversed = [...SHEET].reverse();
  assert.equal(pickDefaultPackage({ need: 15, balance: 10, bonusEligible: false, packages: reversed }), "star_30");
});

test("leftoverAfter — 잔액 + 받는 별 − 가격", () => {
  assert.equal(leftoverAfter({ need: 15, balance: 10, pkg: pkg("star_30"), bonusEligible: false }), 25);
  assert.equal(leftoverAfter({ need: 15, balance: 10, pkg: pkg("star_10"), bonusEligible: true }), 7);
  assert.equal(leftoverAfter({ need: 55, balance: 20, pkg: pkg("star_10"), bonusEligible: false }), -25);
  assert.equal(leftoverAfter({ need: 40, balance: 10, pkg: pkg("star_30"), bonusEligible: false }), 0);
});

test("parseNeedParam — 양의 정수(1~1000)만 통과", () => {
  assert.equal(parseNeedParam("15"), 15);
  assert.equal(parseNeedParam("1000"), 1000);
  assert.equal(parseNeedParam(null), null);
  assert.equal(parseNeedParam(""), null);
  assert.equal(parseNeedParam("0"), null);
  assert.equal(parseNeedParam("-5"), null);
  assert.equal(parseNeedParam("12.5"), null);
  assert.equal(parseNeedParam("abc"), null);
  assert.equal(parseNeedParam("1001"), null);
});

test("firstChargeBonusPercent — 상수에서 계산(배너가 다시 '1.5배' 로 어긋나지 않게)", () => {
  assert.equal(firstChargeBonusPercent(), 20);
});
