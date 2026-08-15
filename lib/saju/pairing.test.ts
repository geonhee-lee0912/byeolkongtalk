import { test } from "node:test";
import assert from "node:assert/strict";
import { elementRelation } from "./pairing.ts";

test("elementRelation — 같은 오행은 비화", () => {
  assert.equal(elementRelation("목", "목"), "비화");
  assert.equal(elementRelation("수", "수"), "비화");
});

test("elementRelation — 상대가 나를 생하면 생아, 내가 상대를 생하면 아생", () => {
  // 목생화: 목이 화를 생한다
  assert.equal(elementRelation("화", "목"), "생아"); // 화 입장: 목(상대)이 나(화)를 생
  assert.equal(elementRelation("목", "화"), "아생"); // 목 입장: 나(목)가 화(상대)를 생
});

test("elementRelation — 상대가 나를 극하면 극아, 내가 상대를 극하면 아극", () => {
  // 목극토: 목이 토를 극한다
  assert.equal(elementRelation("토", "목"), "극아"); // 토 입장: 목(상대)이 나(토)를 극
  assert.equal(elementRelation("목", "토"), "아극"); // 목 입장: 나(목)가 토(상대)를 극
});
