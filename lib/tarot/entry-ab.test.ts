import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENTRY_AB,
  ENTRY_FLOW_KEY,
  entryArmForMode,
  entryArmOf,
  entryFeaturesOnFor,
  isNewFlowGuest,
} from "./entry-ab.ts";

const anon = (last: string) => `55555555-5555-4555-8555-55555555555${last}`;

test("익명 쿠키 끝 글자 짝수(0 2 4 6 8 a c e) = 새 흐름, 홀수 = 옛 흐름 — 메뉴판이 반반이 아닐 때", () => {
  for (const c of "02468ace") assert.equal(entryArmForMode(anon(c), "split", "menu"), "new", c);
  for (const c of "13579bdf") assert.equal(entryArmForMode(anon(c), "split", "menu"), "old", c);
  assert.equal(entryArmForMode(anon("A"), "split", "legacy"), "new"); // 대문자도 같은 그룹
});

test("쿠키 없음·빈 값 = 옛 흐름", () => {
  assert.equal(entryArmForMode(null, "split", "menu"), "old");
  assert.equal(entryArmForMode(undefined, "split", "menu"), "old");
  assert.equal(entryArmForMode("", "split", "menu"), "old");
});

test("스위치가 'new'·'old' 면 전원 한쪽", () => {
  assert.equal(entryArmForMode(anon("1"), "new", "menu"), "new");
  assert.equal(entryArmForMode(anon("0"), "old", "menu"), "old");
});

test("🔴 가드 — 메뉴판이 반반(split)이면 스위치와 무관하게 전원 옛 흐름(로그인 전후 가격 어긋남 방지)", () => {
  assert.equal(entryArmForMode(anon("0"), "split", "split"), "old");
  assert.equal(entryArmForMode(anon("0"), "new", "split"), "old");
});

test("새 장치(진행 저장·회원 충전 왕복 복원)는 스위치가 old 가 아니고 메뉴판이 반반이 아닐 때만", () => {
  assert.equal(entryFeaturesOnFor("old", "menu"), false);
  assert.equal(entryFeaturesOnFor("split", "split"), false);
  assert.equal(entryFeaturesOnFor("split", "menu"), true);
  assert.equal(entryFeaturesOnFor("new", "legacy"), true);
});

test("구현 중 기본 스위치 = old — 켤 때 이 테스트도 같이 고칠 것(지우지 말 것)", () => {
  assert.equal(ENTRY_AB, "old");
  assert.equal(entryArmOf(anon("0")), "old");
});

test("고민 쓰기 안내 키는 고정 문자열", () => {
  assert.equal(ENTRY_FLOW_KEY, "byeolkong:entry_flow");
});

test("isNewFlowGuest — 지갑이 '새 흐름 비로그인'일 때만", () => {
  assert.equal(isNewFlowGuest(null), false);
  assert.equal(isNewFlowGuest(undefined), false);
  assert.equal(isNewFlowGuest({ isGuest: true, entryArm: "new" }), true);
  assert.equal(isNewFlowGuest({ isGuest: false, entryArm: "new" }), false);
  assert.equal(isNewFlowGuest({ isGuest: true, entryArm: "old" }), false);
});
