import { test } from "node:test";
import assert from "node:assert/strict";
import {
  elementRelation,
  tenGod,
  TEN_GOD_LABEL,
  heavenlyCombo,
  earthlySixCombo,
  findTriads,
  STEM_ELEMENT,
  pairRelation,
} from "./pairing.ts";
import type { SajuResult } from "./calc.ts";

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

test("heavenlyCombo — 5쌍만 true, 순서 무관", () => {
  assert.equal(heavenlyCombo("갑", "기"), true);
  assert.equal(heavenlyCombo("기", "갑"), true); // 순서 무관
  assert.equal(heavenlyCombo("을", "경"), true);
  assert.equal(heavenlyCombo("병", "신"), true);
  assert.equal(heavenlyCombo("정", "임"), true);
  assert.equal(heavenlyCombo("무", "계"), true);
  assert.equal(heavenlyCombo("갑", "을"), false);
  assert.equal(heavenlyCombo("갑", "갑"), false);
});

test("earthlySixCombo — 6쌍만 true, 순서 무관", () => {
  assert.equal(earthlySixCombo("자", "축"), true);
  assert.equal(earthlySixCombo("축", "자"), true);
  assert.equal(earthlySixCombo("인", "해"), true);
  assert.equal(earthlySixCombo("묘", "술"), true);
  assert.equal(earthlySixCombo("진", "유"), true);
  assert.equal(earthlySixCombo("사", "신"), true);
  assert.equal(earthlySixCombo("오", "미"), true);
  assert.equal(earthlySixCombo("자", "인"), false);
});

test("findTriads — 세 일지가 다 있으면 완성 삼합", () => {
  assert.deepEqual(findTriads(["신", "자", "진"]), [
    { branches: ["신", "자", "진"], element: "수" },
  ]);
});

test("findTriads — 하나라도 빠지면(반합) 성립 안 함", () => {
  assert.deepEqual(findTriads(["신", "자"]), []);
});

test("findTriads — 여러 삼합 동시 성립", () => {
  const triads = findTriads(["신", "자", "진", "인", "오", "술"]);
  assert.equal(triads.length, 2);
  assert.ok(triads.some((t) => t.element === "수"));
  assert.ok(triads.some((t) => t.element === "화"));
});

test("findTriads — 같은 지지가 두 명이어도 삼합 지지 3종이 다 있으면 성립", () => {
  // 일지 순서 무관, 존재 여부만 본다
  assert.deepEqual(findTriads(["진", "신", "자", "자"]), [
    { branches: ["신", "자", "진"], element: "수" },
  ]);
});

test("findTriads — 목·금 삼합도 정확히 판정", () => {
  assert.deepEqual(findTriads(["해", "묘", "미"]), [{ branches: ["해", "묘", "미"], element: "목" }]);
  assert.deepEqual(findTriads(["사", "유", "축"]), [{ branches: ["사", "유", "축"], element: "금" }]);
});

// 테스트용 최소 SajuResult — pairRelation 이 읽는 필드만 채운다.
function mkSaju(dayStem: string, dayBranch: string): SajuResult {
  const el = STEM_ELEMENT[dayStem];
  return {
    pillars: {
      year: { stem: "", branch: "", hanja: "" },
      month: { stem: "", branch: "", hanja: "" },
      day: { stem: dayStem, branch: dayBranch, hanja: "" },
      hour: { stem: "", branch: "", hanja: "" },
    },
    dayStem,
    dayElement: el,
    elementCount: { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 },
    yinYangCount: { yang: 0, yin: 0 },
    koreanString: "",
    hanjaString: "",
    input: { gender: "other", hourKnown: true, inputCalendar: "solar", isLeapMonth: false },
  };
}

test("pairRelation — 오행관계·양방향 십신·라벨·천간합·육합을 종합", () => {
  const a = mkSaju("갑", "자"); // 갑목, 일지 자
  const b = mkSaju("기", "축"); // 기토, 일지 축
  const r = pairRelation(a, b);

  assert.equal(r.element, "아극"); // 갑목이 기토를 극(목극토)
  assert.equal(r.tenGodAtoB, "정재"); // 갑→기: 아극·양음
  assert.equal(r.tenGodBtoA, "정관"); // 기→갑: 극아·음양
  assert.equal(r.labelAtoB, TEN_GOD_LABEL["정재"]);
  assert.equal(r.labelBtoA, TEN_GOD_LABEL["정관"]);
  assert.equal(r.heavenlyCombo, true); // 갑기합
  assert.equal(r.sixCombo, true); // 자축 육합
});

test("pairRelation — 합이 없는 쌍은 false", () => {
  const a = mkSaju("갑", "자");
  const b = mkSaju("갑", "인");
  const r = pairRelation(a, b);
  assert.equal(r.element, "비화");
  assert.equal(r.heavenlyCombo, false);
  assert.equal(r.sixCombo, false);
});
