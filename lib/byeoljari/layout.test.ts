import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLayout,
  starPoints,
  focusTransform,
  focusPair,
  orderByAngle,
  resolveGlyph,
  radialLabelPos,
  orientEdge,
  invertElementRelation,
  nodeMatchesFilter,
  edgeMatchesFilter,
} from "./layout.ts";
import type { GraphNode, GraphEdge } from "./types.ts";

function node(id: string, isHost = false): GraphNode {
  return { id, name: null, isHost, relationType: "friend", element: "목", dayType: "봄 화초형" };
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

test("computeLayout — centerId 지정 시 그 노드가 중심(50,50)", () => {
  const m = computeLayout([node("h", true), node("g1"), node("g2")], { centerId: "g1" });
  assert.deepEqual(m.get("g1"), { x: 50, y: 50 });
  assert.notDeepEqual(m.get("h"), { x: 50, y: 50 }); // 호스트는 이제 링 위
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

test("resolveGlyph — 주인=원(host-circle, meId 무관), 나(비host)=강조별, 그 외=별", () => {
  assert.equal(resolveGlyph(node("h", true), null), "host-circle"); // 호스트, meId 없음 → 원
  assert.equal(resolveGlyph(node("h", true), "h"), "host-circle"); // 호스트==나 → 원(host 우선)
  assert.equal(resolveGlyph(node("g"), "g"), "me-star"); // 게스트==나 → 강조 별(best-effort)
  assert.equal(resolveGlyph(node("g"), "other"), "star"); // 게스트, 나 아님
  assert.equal(resolveGlyph(node("g"), null), "star"); // 게스트, meId 없음
});

test("radialLabelPos — 별 바깥 방향(중앙 반대) + 좌우 anchor, 중앙은 아래", () => {
  const right = radialLabelPos({ x: 84, y: 50 }, 4);
  assert.equal(right.anchor, "start");
  assert.ok(right.x > 84, `right.x=${right.x}`);
  const left = radialLabelPos({ x: 16, y: 50 }, 4);
  assert.equal(left.anchor, "end");
  assert.ok(left.x < 16, `left.x=${left.x}`);
  const top = radialLabelPos({ x: 50, y: 16 }, 4);
  assert.equal(top.anchor, "middle");
  assert.ok(top.y < 16, `top.y=${top.y}`); // 위쪽 별은 라벨도 위로
  const center = radialLabelPos({ x: 50, y: 50 }, 4);
  assert.equal(center.anchor, "middle");
  assert.ok(center.y > 50, `center.y=${center.y}`); // 호스트(중앙)는 아래
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
    tenGodAtoB: "정재", tenGodBtoA: "편관",
    inyeon: 0, triadShared: false,
    heavenlyCombo: false, sixCombo: false,
  };
  assert.deepEqual(orientEdge(e, "H"), {
    iSeeThem: "내가 이끄는 사람", theySeeMe: "든든한 지원군", element: "아극",
    iSeeThemTenGod: "정재", theySeeMeTenGod: "편관",
  });
  assert.deepEqual(orientEdge(e, "G"), {
    iSeeThem: "든든한 지원군", theySeeMe: "내가 이끄는 사람", element: "극아",
    iSeeThemTenGod: "편관", theySeeMeTenGod: "정재",
  });
  assert.equal(orientEdge(e, "Z"), null);
});

test("nodeMatchesFilter — 필터 없으면 전체, 호스트는 항상, 게스트는 관계 일치 시", () => {
  const host = node("h", true);
  const friend = { ...node("f"), relationType: "friend" };
  const lover = { ...node("l"), relationType: "lover" };
  assert.equal(nodeMatchesFilter(lover, null), true); // 필터 없음 → 전체
  assert.equal(nodeMatchesFilter(host, "friend"), true); // 호스트 항상
  assert.equal(nodeMatchesFilter(friend, "friend"), true);
  assert.equal(nodeMatchesFilter(lover, "friend"), false);
});

test("edgeMatchesFilter — 비호스트 끝점 관계로 판정(호스트는 매칭 제외)", () => {
  const host = node("h", true);
  const friend = { ...node("f"), relationType: "friend" };
  const lover = { ...node("l"), relationType: "lover" };
  assert.equal(edgeMatchesFilter(host, friend, null), true); // 필터 없음
  assert.equal(edgeMatchesFilter(host, friend, "friend"), true); // 호스트↔친구
  assert.equal(edgeMatchesFilter(host, lover, "friend"), false); // 호스트↔연인 dim
  assert.equal(edgeMatchesFilter(friend, lover, "friend"), true); // 게스트끼리, 친구 포함
});

test("orientEdge — 십신도 pivot 기준 방향 정렬", () => {
  const edge = {
    a: "A", b: "B", element: "아극",
    labelAtoB: "라벨AB", labelBtoA: "라벨BA",
    tenGodAtoB: "편재", tenGodBtoA: "정관",
    inyeon: 0, triadShared: false,
    heavenlyCombo: false, sixCombo: false,
  };
  const oa = orientEdge(edge, "A");
  assert.equal(oa?.iSeeThemTenGod, "편재");
  assert.equal(oa?.theySeeMeTenGod, "정관");
  const ob = orientEdge(edge, "B");
  assert.equal(ob?.iSeeThemTenGod, "정관");
  assert.equal(ob?.theySeeMeTenGod, "편재");
  assert.equal(orientEdge(edge, "Z"), null);
});

const apply = (t: { tx: number; ty: number; s: number }, p: { x: number; y: number }) => ({
  x: t.tx + t.s * p.x,
  y: t.ty + t.s * p.y,
});
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps;

test("focusPair: 두 점의 중점이 화면 중심(50,50)으로 온다", () => {
  const me = { x: 50, y: 50 };
  const them = { x: 50, y: 16 };
  const t = focusPair(me, them);
  const mid = apply(t, { x: 50, y: 33 });
  assert.ok(near(mid.x, 50), `mid.x=${mid.x}`);
  assert.ok(near(mid.y, 50), `mid.y=${mid.y}`);
});

test("focusPair: 두 점 모두 뷰(0..100) 안에 들어온다", () => {
  const me = { x: 50, y: 50 };
  const them = { x: 50, y: 16 };
  const t = focusPair(me, them);
  for (const p of [me, them]) {
    const q = apply(t, p);
    assert.ok(q.x >= 0 && q.x <= 100, `x=${q.x}`);
    assert.ok(q.y >= 0 && q.y <= 100, `y=${q.y}`);
  }
});

test("focusPair: 가까운 쌍은 maxScale(2)로 캡", () => {
  const t = focusPair({ x: 50, y: 50 }, { x: 50, y: 46 });
  assert.equal(t.s, 2);
});

test("focusPair: 멀리 떨어진 쌍도 둘 다 뷰 안(배율 축소)", () => {
  const a = { x: 16, y: 50 };
  const b = { x: 84, y: 50 };
  const t = focusPair(a, b);
  assert.ok(t.s < 1.3, `s=${t.s}`);
  for (const p of [a, b]) {
    const q = apply(t, p);
    assert.ok(q.x >= 0 && q.x <= 100, `x=${q.x}`);
  }
});
