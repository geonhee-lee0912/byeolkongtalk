import { test } from "node:test";
import assert from "node:assert/strict";
import { elementRelation, tenGod, TEN_GOD_LABEL } from "./pairing.ts";

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

test("tenGod — 갑(양목) 기준 10천간의 십신", () => {
  assert.equal(tenGod("갑", "갑"), "비견"); // 비화 · 양양(같음)
  assert.equal(tenGod("갑", "을"), "겁재"); // 비화 · 양음(다름)
  assert.equal(tenGod("갑", "병"), "식신"); // 아생(목생화) · 양양
  assert.equal(tenGod("갑", "정"), "상관"); // 아생 · 양음
  assert.equal(tenGod("갑", "무"), "편재"); // 아극(목극토) · 양양
  assert.equal(tenGod("갑", "기"), "정재"); // 아극 · 양음
  assert.equal(tenGod("갑", "경"), "편관"); // 극아(금극목) · 양양
  assert.equal(tenGod("갑", "신"), "정관"); // 극아 · 양음
  assert.equal(tenGod("갑", "임"), "편인"); // 생아(수생목) · 양양
  assert.equal(tenGod("갑", "계"), "정인"); // 생아 · 양음
});

test("tenGod — 방향성: A→B 와 B→A 가 다르다", () => {
  assert.equal(tenGod("갑", "병"), "식신");
  assert.equal(tenGod("병", "갑"), "편인"); // 병 입장 갑은 생아(목생화)·양양
});

test("TEN_GOD_LABEL — 10종 전부 별콩 라벨이 있고 한자명이 아니다", () => {
  const gods = ["비견","겁재","식신","상관","편재","정재","편관","정관","편인","정인"] as const;
  for (const g of gods) {
    assert.ok(TEN_GOD_LABEL[g], `${g} 라벨 없음`);
    assert.notEqual(TEN_GOD_LABEL[g], g); // 한자명 그대로 노출 금지
  }
});
