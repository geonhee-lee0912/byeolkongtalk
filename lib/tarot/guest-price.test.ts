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

test("guestShortLine — 선물로 되면 무료, 넘으면 모자란 별 + 최소 금액", () => {
  assert.deepEqual(guestShortLine(15, "menu"), { free: true, text: "가입 선물로 무료" });
  assert.deepEqual(guestShortLine(10, "legacy"), { free: true, text: "가입 선물로 무료" });
  assert.deepEqual(guestShortLine(55, "menu"), { free: false, text: "가입 선물 + ⭐40만 더 (₩4,900부터)" });
  assert.deepEqual(guestShortLine(40, "legacy"), { free: false, text: "가입 선물 + ⭐25만 더 (₩2,800부터)" });
});

test("guestSheetLine — 로그인 창 가격 줄", () => {
  assert.equal(guestSheetLine(15, "menu"), "첫 풀이는 가입 선물로 무료");
  assert.equal(guestSheetLine(70, "menu"), "가입 선물 15별 + ⭐55만 더 (₩4,900부터)");
});

test("priceLine — 로그인 전(표시용 지갑): 맛보기 '가입 선물로 무료' · 유료는 모자란 별 + 최소 금액", () => {
  const [teaser, mid, deep] = getMenu("걔 속마음이 궁금해");
  const g = guestWallet("menu");
  assert.deepEqual(priceLine(teaser, g), { main: "가입 선물로 무료", sub: null, free: true });
  assert.deepEqual(priceLine(mid, g), { main: "⭐25", sub: "가입 선물 + ⭐10만 더 (₩1,000부터)", free: false });
  assert.deepEqual(priceLine(deep, g), { main: "⭐55", sub: "가입 선물 + ⭐40만 더 (₩4,900부터)", free: false });
});

test("priceLine — 옛 흐름 그룹 비로그인의 실제 지갑(entryArm old)은 지금 문구 그대로(대조군 불변)", () => {
  const [teaser, , deep] = getMenu("걔 속마음이 궁금해");
  const raw = { balance: 0, isGuest: true, giftUnused: false, menuArm: "menu" as const, entryArm: "old" as const };
  assert.deepEqual(priceLine(teaser, raw), { main: "⭐15", sub: null, free: false });
  assert.deepEqual(priceLine(deep, raw), { main: "⭐55", sub: "⭐55만 더", free: false });
});
