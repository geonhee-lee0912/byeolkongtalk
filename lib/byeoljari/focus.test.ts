import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFocusGraph } from "./focus.ts";
import type { StarGraph } from "./types.ts";

const edge = (a: string, b: string, h = false, s = false) => ({
  a, b, element: "생아", labelAtoB: "", labelBtoA: "", tenGodAtoB: "", tenGodBtoA: "",
  inyeon: h || s ? 87 : 62, triadShared: false, heavenlyCombo: h, sixCombo: s,
});
const G: StarGraph = {
  ok: true, shareId: "s", claimed: false,
  nodes: [
    { id: "me", name: "나", isHost: true, relationType: "friend", element: "화" },
    { id: "a", name: "A", isHost: false, relationType: "friend", element: "목" },
    { id: "b", name: "B", isHost: false, relationType: "lover", element: "수" },
    { id: "c", name: "C", isHost: false, relationType: "friend", element: "토" },
  ],
  edges: [edge("me", "a"), edge("me", "b"), edge("me", "c"), edge("a", "b", true, false)],
  triads: [],
};

test("buildFocusGraph(a) — 나 + a + a와 엣지 있는 b, 무관 c 제외", () => {
  const f = buildFocusGraph("a", G);
  assert.deepEqual(f.nodes.map((n) => n.id).sort(), ["a", "b", "me"]);
});
test("buildFocusGraph(a) — spoke 는 전부 a 발, a-b 는 실제 엣지(천간합) 재사용", () => {
  const f = buildFocusGraph("a", G);
  assert.equal(f.edges.length, 2); // a-me, a-b
  assert.ok(f.edges.every((e) => e.a === "a" || e.b === "a"));
  const ab = f.edges.find((e) => (e.a === "a" && e.b === "b") || (e.a === "b" && e.b === "a"));
  assert.equal(ab?.heavenlyCombo, true);
});
test("buildFocusGraph(me) — 나 중심이면 호스트 엣지 이웃 전부", () => {
  const f = buildFocusGraph("me", G);
  assert.deepEqual(f.nodes.map((n) => n.id).sort(), ["a", "b", "c", "me"]);
});
test("buildFocusGraph — 삼합-only 이웃은 중립 spoke 합성", () => {
  const G2: StarGraph = { ...G, edges: [edge("me", "a")], triads: [{ element: "화", memberIds: ["a", "d"] }],
    nodes: [...G.nodes, { id: "d", name: "D", isHost: false, relationType: "friend", element: "화" }] };
  const f = buildFocusGraph("a", G2);
  assert.ok(f.nodes.some((n) => n.id === "d")); // 삼합 mate 포함
  const ad = f.edges.find((e) => (e.a === "a" && e.b === "d") || (e.a === "d" && e.b === "a"));
  assert.ok(ad && !ad.heavenlyCombo && !ad.sixCombo); // 중립 spoke
});
