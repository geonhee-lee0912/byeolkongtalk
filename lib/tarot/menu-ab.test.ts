import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MENU_AB, MENU_LAST_CHARS, armForMode, menuArmOf } from "./menu-ab.ts";

const uuid = (last: string) => `44444444-4444-4444-8444-44444444444${last}`;

test("user_id 끝 글자 짝수(0 2 4 6 8 a c e) = 메뉴판, 홀수 = 옛 — SQL position(right(id,1) in '02468ace') 와 같은 규칙", () => {
  for (const c of "02468ace") assert.equal(armForMode(uuid(c), "split"), "menu", c);
  for (const c of "13579bdf") assert.equal(armForMode(uuid(c), "split"), "legacy", c);
});

test("대문자 UUID 도 같은 그룹", () => {
  assert.equal(armForMode(uuid("A"), "split"), "menu");
  assert.equal(armForMode(uuid("B"), "split"), "legacy");
});

test("비로그인·빈 값 = 옛 그룹(지금 prod 그대로)", () => {
  assert.equal(armForMode(null, "split"), "legacy");
  assert.equal(armForMode(undefined, "split"), "legacy");
  assert.equal(armForMode("", "split"), "legacy");
});

test("스위치가 'menu'·'legacy' 면 전원 한쪽", () => {
  assert.equal(armForMode(uuid("1"), "menu"), "menu");
  assert.equal(armForMode(null, "menu"), "menu");
  assert.equal(armForMode(uuid("0"), "legacy"), "legacy");
});

test("배포 기본 스위치 = split", () => {
  assert.equal(MENU_AB, "split");
  assert.equal(menuArmOf(uuid("0")), "menu");
  assert.equal(menuArmOf(uuid("1")), "legacy");
});

test("감시 쿼리(scripts/menu-ab-daily-check.sql)의 그룹식이 같은 끝 글자 집합을 쓴다", () => {
  const sql = readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8");
  const sets = [...sql.matchAll(/position\(\s*right\([^)]*\)\s*in\s*'([0-9a-f]+)'\s*\)\s*>\s*0/g)].map((m) => m[1]);
  assert.ok(sets.length > 0, "그룹식을 못 찾았다");
  for (const s of sets) assert.equal(s, MENU_LAST_CHARS);
});

test("QA 하네스 기본 유저(11111111-…-111111111111)는 옛 그룹 — QA 스크립트가 SPREAD_INFO.starCost(=옛 가격)를 기대한다", () => {
  assert.equal(menuArmOf("11111111-1111-4111-8111-111111111111"), "legacy");
});
