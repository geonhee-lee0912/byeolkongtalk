import { test } from "node:test";
import assert from "node:assert/strict";
import { guestSheetLine, guestShortLine, minTopUpWon } from "./guest-price.ts";

// 경계 — 가장 작은 시트 칸이 첫 충전 보너스(+20%)까지 받아 덮는 최대 모자람은 그 칸 가격, 1 더 모자라면 다음 칸 가격(마지막 칸 너머는 null).
// 숫자는 상수에서 계산해 박았다: 받는 별 = 별 + round(별 × FIRST_CHARGE_BONUS_RATE) → star_10 12 · star_30 36 · star_70 84.
// 패키지·보너스율·시트 칸(SHEET_PACKAGE_IDS)이 바뀌면 이 표가 먼저 깨진다 — 로그인 창에 적힌 '(N원부터)' 약속이 달라지는 것이니 값을 확인하고 고칠 것.
test("minTopUpWon 경계 — 칸이 덮는 최대 모자람 = 그 칸 가격 · +1 = 다음 칸 가격", () => {
  const table: Array<[number, number | null]> = [[0, 0], [1, 1000], [12, 1000], [13, 2800], [36, 2800], [37, 5900], [84, 5900], [85, null]];
  for (const [short, won] of table) assert.equal(minTopUpWon(short), won);
});

test("guestShortLine — 선물로 되면 무료, 넘으면 모자란 별만(금액은 로그인 창 줄에만 — 사용자 2026-10-25)", () => {
  assert.deepEqual(guestShortLine(15), { free: true, text: "가입 선물로 무료" });
  assert.deepEqual(guestShortLine(10), { free: true, text: "가입 선물로 무료" });
  assert.deepEqual(guestShortLine(55), { free: false, text: "가입 선물 + ⭐40만 더" });
  assert.deepEqual(guestShortLine(40), { free: false, text: "가입 선물 + ⭐25만 더" });
  assert.deepEqual(guestShortLine(25), { free: false, text: "가입 선물 + ⭐10만 더" });
});

test("guestSheetLine — 로그인 창 가격 줄", () => {
  assert.equal(guestSheetLine(15), "첫 풀이는 가입 선물로 무료");
  assert.equal(guestSheetLine(55), "가입 선물 15별 + ⭐40만 더 (5,900원부터)");
  assert.equal(guestSheetLine(25), "가입 선물 15별 + ⭐10만 더 (1,000원부터)");
});
