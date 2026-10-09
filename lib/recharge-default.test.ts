import { test } from "node:test";
import assert from "node:assert/strict";
import { STAR_PACKAGES, SHOP_PACKAGE_IDS, shopPackages, type StarPackage } from "./constants.ts";
import {
  SHEET_PACKAGE_IDS,
  sheetPackages,
  receivedStars,
  pickDefaultPackage,
  leftoverAfter,
  parseNeedParam,
  firstChargeBonusPercent,
} from "./recharge-default.ts";

const SHEET_MENU = sheetPackages("menu");
const SHEET_LEGACY = sheetPackages("legacy");
const SHOP_MENU = shopPackages("menu");
const SHOP_LEGACY = shopPackages("legacy");
const pkg = (id: string) => STAR_PACKAGES.find((p) => p.id === id)!;
const pickFrom = (packages: StarPackage[], bonusEligible = false) => (shortfall: number) =>
  pickDefaultPackage({ need: 100 + shortfall, balance: 100, bonusEligible, packages });

test("시트 칸 — 메뉴판 10·30·55·70 / 옛 10·30·70(지금 prod) · 큰 칸은 /shop 전용", () => {
  assert.deepEqual(SHEET_MENU.map((p) => p.id), ["star_10", "star_30", "star_55", "star_70"]);
  assert.deepEqual(SHEET_LEGACY.map((p) => p.id), ["star_10", "star_30", "star_70"]);
});

test("시트 칸은 그 그룹 상점 칸의 부분집합 — 큰 칸·다른 그룹 칸이 시트로 새지 않게", () => {
  for (const arm of ["menu", "legacy"] as const) {
    for (const id of SHEET_PACKAGE_IDS[arm]) assert.ok(SHOP_PACKAGE_IDS[arm].includes(id), `${arm} ${id}`);
  }
});

test("receivedStars — 보너스 자격이면 +20% 반올림(화면 표시와 같은 Math.round)", () => {
  assert.equal(receivedStars(pkg("star_10"), false), 10);
  assert.equal(receivedStars(pkg("star_10"), true), 12);
  assert.equal(receivedStars(pkg("star_30"), true), 36);
  assert.equal(receivedStars(pkg("star_55"), true), 66);
  assert.equal(receivedStars(pkg("star_70"), true), 84);
  assert.equal(receivedStars(pkg("star_130"), true), 156);
});

test("pickDefaultPackage — 모르거나 부족하지 않으면 null(화면 기존 기본값 유지)", () => {
  assert.equal(pickDefaultPackage({ need: null, balance: 5, bonusEligible: false, packages: SHEET_MENU }), null);
  assert.equal(pickDefaultPackage({ need: 15, balance: null, bonusEligible: false, packages: SHEET_MENU }), null);
  assert.equal(pickDefaultPackage({ need: 15, balance: 15, bonusEligible: false, packages: SHEET_MENU }), null);
  assert.equal(pickDefaultPackage({ need: 15, balance: 20, bonusEligible: false, packages: SHEET_MENU }), null);
});

test("메뉴판 시트 · 보너스 없음 — 최소 충분 패키지의 한 단계 위, star_70 상한", () => {
  const pick = pickFrom(SHEET_MENU);
  assert.equal(pick(1), "star_30");
  assert.equal(pick(10), "star_30");
  assert.equal(pick(11), "star_55");
  assert.equal(pick(30), "star_55");
  assert.equal(pick(31), "star_70");
  assert.equal(pick(55), "star_70");
  assert.equal(pick(56), "star_70"); // min 이 star_70 → 상한 그대로
  assert.equal(pick(70), "star_70");
});

test("메뉴판 시트 · 보너스 자격 — 받는 별(12/36/66/84) 기준", () => {
  const pick = pickFrom(SHEET_MENU, true);
  assert.equal(pick(12), "star_30");
  assert.equal(pick(13), "star_55"); // 스펙 §3-4: 13~36 구간이 70칸 → 55칸
  assert.equal(pick(36), "star_55");
  assert.equal(pick(37), "star_70");
  assert.equal(pick(66), "star_70");
  assert.equal(pick(67), "star_70");
});

test("새 유저가 맛보기 뒤 깊게(55) — 잔액 0·첫 충전: 기본 70칸, 55칸만으로도 11 남는다", () => {
  const input = { need: 55, balance: 0, bonusEligible: true };
  assert.equal(pickDefaultPackage({ ...input, packages: SHEET_MENU }), "star_70");
  assert.equal(leftoverAfter({ ...input, pkg: pkg("star_55") }), 11);
});

test("옛 시트(지금 prod) — 규칙 그대로", () => {
  const pick = pickFrom(SHEET_LEGACY);
  assert.equal(pick(1), "star_30");
  assert.equal(pick(5), "star_30");
  assert.equal(pick(10), "star_30");
  assert.equal(pick(11), "star_70");
  assert.equal(pick(30), "star_70"); // 메뉴판은 여기서 star_55 로 갈라진다 — 옛 그룹은 prod 그대로 70
  assert.equal(pick(31), "star_70");
  assert.equal(pick(70), "star_70");
  const pickBonus = pickFrom(SHEET_LEGACY, true);
  assert.equal(pickBonus(12), "star_30");
  assert.equal(pickBonus(13), "star_70");
  assert.equal(pickBonus(36), "star_70"); // 메뉴판은 여기서 star_55
  assert.equal(pickBonus(37), "star_70");
});

test("상점 — 상한은 최소 충분 패키지보다 작아지지 않는다", () => {
  const menu = pickFrom(SHOP_MENU);
  assert.equal(menu(5), "star_30");
  assert.equal(menu(20), "star_55");
  assert.equal(menu(31), "star_70");
  assert.equal(menu(56), "star_70");
  assert.equal(menu(71), "star_130"); // star_70 로는 못 덮음 → min
  assert.equal(menu(131), "star_130"); // 아무것도 못 덮음 → 가장 큰 것
  const legacy = pickFrom(SHOP_LEGACY);
  assert.equal(legacy(5), "star_30");
  assert.equal(legacy(20), "star_70");
  assert.equal(legacy(71), "star_150");
  assert.equal(legacy(151), "star_300");
});

test("어느 것도 못 덮으면 목록의 가장 큰 패키지", () => {
  assert.equal(pickDefaultPackage({ need: 200, balance: 0, bonusEligible: false, packages: SHEET_MENU }), "star_70");
  assert.equal(pickDefaultPackage({ need: 200, balance: 0, bonusEligible: false, packages: SHEET_LEGACY }), "star_70");
  assert.equal(pickDefaultPackage({ need: 999, balance: 0, bonusEligible: false, packages: SHOP_MENU }), "star_130");
  assert.equal(pickDefaultPackage({ need: 999, balance: 0, bonusEligible: false, packages: SHOP_LEGACY }), "star_300");
});

test("pickDefaultPackage — 패키지 순서와 무관(별 수로 정렬)", () => {
  const reversed = [...SHEET_MENU].reverse();
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
