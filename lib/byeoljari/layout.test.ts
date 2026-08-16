import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLayout,
  starPoints,
  focusTransform,
  orderByAngle,
  resolveGlyph,
  orientEdge,
  invertElementRelation,
} from "./layout.ts";
import type { GraphNode, GraphEdge } from "./types.ts";

function node(id: string, isHost = false): GraphNode {
  return { id, name: null, isHost, relationType: "friend", element: "목", compatVisible: false };
}

test("computeLayout — 호스트는 중심(50,50)", () => {
  const m = computeLayout([node("h", true), node("g1"), node("g2")]);
  assert.deepEqual(m.get("h"), { x: 50, y: 50 });
});

test("computeLayout — 첫 게스트는 상단(-90°)", () => {
  const m = computeLayout([node("h", true), node("g1")]);
  assert.deepEqual(m.get("g1"), { x: 50, y: 16 }); // 50 + 34*sin(-90°) = 16
});

test("computeLayout — 호스트 없으면 nodes[0] 중심(방어)", () => {
  const m = computeLayout([node("a"), node("b")]);
  assert.deepEqual(m.get("a"), { x: 50, y: 50 });
});

test("computeLayout — 호스트 단독이면 중심만", () => {
  const m = computeLayout([node("h", true)]);
  assert.equal(m.size, 1);
  assert.deepEqual(m.get("h"), { x: 50, y: 50 });
});

test("computeLayout — 빈 입력은 빈 맵(방어)", () => {
  assert.equal(computeLayout([]).size, 0);
});

test("starPoints — 첫 꼭지는 위쪽(cx, cy-rOuter)", () => {
  assert.equal(starPoints(50, 50, 10, 4, 5, -90).split(" ")[0], "50,40");
});

test("starPoints — 5꼭지별은 10개 점", () => {
  assert.equal(starPoints(50, 50, 10, 4).split(" ").length, 10);
});

test("focusTransform — 노드를 중심으로 이동", () => {
  assert.deepEqual(focusTransform({ x: 34, y: 50 }, 2), { tx: -18, ty: -50, s: 2 });
});

test("focusTransform — 중심 노드는 그대로", () => {
  assert.deepEqual(focusTransform({ x: 50, y: 50 }, 2), { tx: -50, ty: -50, s: 2 });
});

test("orderByAngle — 각도 오름차순 인덱스", () => {
  const pts = [{ x: 60, y: 50 }, { x: 50, y: 60 }, { x: 40, y: 50 }];
  assert.deepEqual(orderByAngle(pts), [2, 0, 1]);
});

test("resolveGlyph — 호스트/나/일반", () => {
  assert.equal(resolveGlyph(node("h", true), "h"), "host-star"); // 호스트==나면 호스트 우선
  assert.equal(resolveGlyph(node("g"), "g"), "me-circle");
  assert.equal(resolveGlyph(node("g"), "other"), "star");
  assert.equal(resolveGlyph(node("g"), null), "star");
});

test("invertElementRelation — 생아↔아생, 극아↔아극, 비화 고정", () => {
  assert.equal(invertElementRelation("생아"), "아생");
  assert.equal(invertElementRelation("아생"), "생아");
  assert.equal(invertElementRelation("극아"), "아극");
  assert.equal(invertElementRelation("아극"), "극아");
  assert.equal(invertElementRelation("비화"), "비화");
});

test("orientEdge — pivot 기준 방향(남이 보는 나)", () => {
  const e: GraphEdge = {
    a: "H", b: "G", element: "아극",
    labelAtoB: "내가 이끄는 사람", labelBtoA: "든든한 지원군",
    heavenlyCombo: false, sixCombo: false,
  };
  assert.deepEqual(orientEdge(e, "H"), { iSeeThem: "내가 이끄는 사람", theySeeMe: "든든한 지원군", element: "아극" });
  assert.deepEqual(orientEdge(e, "G"), { iSeeThem: "든든한 지원군", theySeeMe: "내가 이끄는 사람", element: "극아" });
  assert.equal(orientEdge(e, "Z"), null);
});
