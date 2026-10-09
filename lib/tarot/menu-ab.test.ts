import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU_AB, menuArmOf } from "./menu-ab.ts";

const uuid = (last: string) => `44444444-4444-4444-8444-44444444444${last}`;

test("user_id 끝 글자 짝수(0 2 4 6 8 a c e) = 메뉴판, 홀수 = 옛 — SQL position(right(id,1) in '02468ace') 와 같은 규칙", () => {
  for (const c of "02468ace") assert.equal(menuArmOf(uuid(c), "split"), "menu", c);
  for (const c of "13579bdf") assert.equal(menuArmOf(uuid(c), "split"), "legacy", c);
});

test("대문자 UUID 도 같은 그룹", () => {
  assert.equal(menuArmOf(uuid("A"), "split"), "menu");
  assert.equal(menuArmOf(uuid("B"), "split"), "legacy");
});

test("비로그인·빈 값 = 옛 그룹(지금 prod 그대로)", () => {
  assert.equal(menuArmOf(null, "split"), "legacy");
  assert.equal(menuArmOf(undefined, "split"), "legacy");
  assert.equal(menuArmOf("", "split"), "legacy");
});

test("스위치가 'menu'·'legacy' 면 전원 한쪽", () => {
  assert.equal(menuArmOf(uuid("1"), "menu"), "menu");
  assert.equal(menuArmOf(null, "menu"), "menu");
  assert.equal(menuArmOf(uuid("0"), "legacy"), "legacy");
});

test("배포 기본 스위치 = split", () => {
  assert.equal(MENU_AB, "split");
  assert.equal(menuArmOf(uuid("0")), "menu");
  assert.equal(menuArmOf(uuid("1")), "legacy");
});
