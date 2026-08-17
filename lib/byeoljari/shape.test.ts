import { test } from "node:test";
import assert from "node:assert/strict";
import { dominantElement, evolutionStage, resolveShape, shouldReveal } from "./shape.ts";
import type { GraphNode } from "./types.ts";
import type { FiveElement } from "../saju/elements.ts";

function node(element: FiveElement, isHost = false): GraphNode {
  return {
    id: element + (isHost ? "-h" : "-" + Math.random().toString(36).slice(2)),
    name: null,
    isHost,
    relationType: "friend",
    element,
    compatVisible: false,
  };
}

test("dominantElement — 최빈 오행", () => {
  assert.equal(dominantElement([node("목"), node("목"), node("화")]), "목");
});

test("dominantElement — 동률이면 호스트 오행 우선", () => {
  // 목2 화2, 호스트=화 → 화
  assert.equal(dominantElement([node("목"), node("목"), node("화", true), node("화")]), "화");
});

test("dominantElement — 동률이지만 호스트가 최빈 아니면 고정순서(목화토금수)", () => {
  // 목2 화2 토1, 호스트=토(1) → 토는 최빈(2) 아님 → 동률 목/화 중 목(먼저)
  assert.equal(
    dominantElement([node("목"), node("목"), node("화"), node("화"), node("토", true)]),
    "목"
  );
});

test("dominantElement — 3파전 동률도 호스트 포함이면 호스트 우선", () => {
  // 목1 화1 토1(host=토): 토도 최빈(동률) → 호스트 우선 → 토 (2파전 제한 회귀 방지)
  assert.equal(dominantElement([node("목"), node("화"), node("토", true)]), "토");
});

test("dominantElement — 빈 입력 null", () => {
  assert.equal(dominantElement([]), null);
});

test("evolutionStage — 경계 1/5/15", () => {
  assert.equal(evolutionStage(1), 1);
  assert.equal(evolutionStage(4), 1);
  assert.equal(evolutionStage(5), 2);
  assert.equal(evolutionStage(14), 2);
  assert.equal(evolutionStage(15), 3);
  assert.equal(evolutionStage(30), 3);
});

test("resolveShape — stage1 목: 청개구리 + 다음 이무기 힌트", () => {
  const s = resolveShape([node("목", true)]); // 1명 stage1
  assert.equal(s?.element, "목");
  assert.equal(s?.stage, 1);
  assert.equal(s?.assetSrc, "/byeoljari/creatures/wood-1.png");
  assert.equal(s?.name, "청개구리");
  assert.equal(s?.nextName, "이무기");
  assert.equal(s?.membersToNext, 4); // 5-1
});

test("resolveShape — stage2 경계(5명): 다음까지 10명", () => {
  const nodes = Array.from({ length: 5 }, (_, i) => node("화", i === 0)); // 5명 화 stage2
  const s = resolveShape(nodes);
  assert.equal(s?.stage, 2);
  assert.equal(s?.name, "불새");
  assert.equal(s?.nextName, "봉황");
  assert.equal(s?.membersToNext, 10); // 15-5
});

test("resolveShape — stage3(15명)는 next 없음", () => {
  const nodes = Array.from({ length: 15 }, (_, i) => node("토", i === 0));
  const s = resolveShape(nodes);
  assert.equal(s?.stage, 3);
  assert.equal(s?.name, "기린");
  assert.equal(s?.nextName, null);
  assert.equal(s?.membersToNext, null);
  assert.equal(s?.assetSrc, "/byeoljari/creatures/earth-3.png");
});

test("resolveShape — 빈 입력 null", () => {
  assert.equal(resolveShape([]), null);
});

test("shouldReveal — 첫 생성 stage1은 리빌 안 함", () => {
  assert.equal(shouldReveal(null, 1), false);
});

test("shouldReveal — 저장 없고 이미 stage2(링크로 큰 별자리 첫 방문) 리빌", () => {
  assert.equal(shouldReveal(null, 2), true);
});

test("shouldReveal — 성장(1→2) 리빌", () => {
  assert.equal(shouldReveal("1", 2), true);
});

test("shouldReveal — 재방문(동일 stage) 리빌 안 함", () => {
  assert.equal(shouldReveal("2", 2), false);
});

test("shouldReveal — 파싱 실패는 baseline 1", () => {
  assert.equal(shouldReveal("abc", 1), false);
  assert.equal(shouldReveal("abc", 2), true);
});

test("shouldReveal — 저장값 '0'은 baseline 1로 폴백", () => {
  assert.equal(shouldReveal("0", 1), false);
  assert.equal(shouldReveal("0", 2), true);
});
