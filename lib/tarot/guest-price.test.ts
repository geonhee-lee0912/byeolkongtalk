import { test } from "node:test";
import assert from "node:assert/strict";
import { guestSheetLine, guestShortLine, guestWallet, minTopUpWon } from "./guest-price.ts";
import { getMenu } from "./menu.ts";
import { priceLine } from "./menu-price.ts";

test("guestWallet — 선물 15별을 막 받은 신규 회원처럼 그리는 표시용 지갑", () => {
  assert.deepEqual(guestWallet("menu"), { balance: 15, isGuest: true, giftUnused: true, menuArm: "menu", entryArm: "new" });
});

test("minTopUpWon — 모자란 별을 덮는 가장 작은 시트 패키지(첫 충전 +20% 포함)", () => {
  assert.equal(minTopUpWon(0, "menu"), 0);
  assert.equal(minTopUpWon(10, "menu"), 1000); // star_10 → 12별
  assert.equal(minTopUpWon(40, "menu"), 4900); // star_30 은 36별이라 못 덮음 → star_55(66별)
  assert.equal(minTopUpWon(55, "menu"), 4900); // star_55 → 66별
  assert.equal(minTopUpWon(25, "legacy"), 2800); // star_30 → 36별
  assert.equal(minTopUpWon(40, "legacy"), 5900); // 옛 시트엔 55 칸이 없다 → star_70
  assert.equal(minTopUpWon(500, "menu"), null); // 시트 칸으로는 못 덮음
});

// 경계 — 가장 작은 시트 칸이 첫 충전 보너스(+20%)까지 받아 덮는 최대 모자람은 그 칸 가격, 1 더 모자라면 다음 칸 가격(마지막 칸 너머는 null).
// 숫자는 상수에서 계산해 박았다: 받는 별 = 별 + round(별 × FIRST_CHARGE_BONUS_RATE) → star_10 12 · star_30 36 · star_55 66 · star_70 84.
// 패키지·보너스율·시트 칸(SHEET_PACKAGE_IDS)이 바뀌면 이 표가 먼저 깨진다 — 로그인 창·메뉴판에 적힌 '(N원부터)' 약속이 달라지는 것이니 값을 확인하고 고칠 것.
test("minTopUpWon 경계 — 칸이 덮는 최대 모자람 = 그 칸 가격 · +1 = 다음 칸 가격", () => {
  const table: Record<"menu" | "legacy", Array<[short: number, won: number | null]>> = {
    // 메뉴판 시트 칸 10 · 30 · 55 · 70
    menu: [[1, 1000], [12, 1000], [13, 2800], [36, 2800], [37, 4900], [66, 4900], [67, 5900], [84, 5900], [85, null]],
    // 옛 시트 칸 10 · 30 · 70 — 55 칸이 없어 37 부터 곧장 70
    legacy: [[1, 1000], [12, 1000], [13, 2800], [36, 2800], [37, 5900], [84, 5900], [85, null]],
  };
  for (const arm of ["menu", "legacy"] as const) {
    for (const [short, won] of table[arm]) assert.equal(minTopUpWon(short, arm), won, `${arm}: ⭐${short} 모자랄 때`);
  }
});

test("guestShortLine — 선물로 되면 무료, 넘으면 모자란 별 + 최소 금액", () => {
  assert.deepEqual(guestShortLine(15, "menu"), { free: true, text: "가입 선물로 무료" });
  assert.deepEqual(guestShortLine(10, "legacy"), { free: true, text: "가입 선물로 무료" });
  assert.deepEqual(guestShortLine(55, "menu"), { free: false, text: "가입 선물 + ⭐40만 더 (4,900원부터)" });
  assert.deepEqual(guestShortLine(40, "legacy"), { free: false, text: "가입 선물 + ⭐25만 더 (2,800원부터)" });
});

test("guestSheetLine — 로그인 창 가격 줄", () => {
  assert.equal(guestSheetLine(15, "menu"), "첫 풀이는 가입 선물로 무료");
  assert.equal(guestSheetLine(70, "menu"), "가입 선물 15별 + ⭐55만 더 (4,900원부터)");
});

test("priceLine — 로그인 전(표시용 지갑): 맛보기 '가입 선물로 무료' · 유료는 모자란 별 + 최소 금액", () => {
  const [teaser, mid, deep] = getMenu("걔 속마음이 궁금해");
  const g = guestWallet("menu");
  assert.deepEqual(priceLine(teaser, g), { main: "가입 선물로 무료", sub: null, free: true });
  assert.deepEqual(priceLine(mid, g), { main: "⭐25", sub: "가입 선물 + ⭐10만 더 (1,000원부터)", free: false });
  assert.deepEqual(priceLine(deep, g), { main: "⭐55", sub: "가입 선물 + ⭐40만 더 (4,900원부터)", free: false });
});

test("priceLine — 옛 흐름 그룹 비로그인의 실제 지갑(entryArm old)은 지금 문구 그대로(대조군 불변)", () => {
  const [teaser, , deep] = getMenu("걔 속마음이 궁금해");
  const raw = { balance: 0, isGuest: true, giftUnused: false, menuArm: "menu" as const, entryArm: "old" as const };
  assert.deepEqual(priceLine(teaser, raw), { main: "⭐15", sub: null, free: false });
  assert.deepEqual(priceLine(deep, raw), { main: "⭐55", sub: "⭐55만 더", free: false });
});
