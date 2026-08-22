import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOND_FILTER_LABEL,
  presentBondFilters,
  edgeActiveForBond,
  nodeActiveForBond,
} from "./bond-filter.ts";

const E = (a: string, b: string, h: boolean, s: boolean) => ({ a, b, heavenlyCombo: h, sixCombo: s });

test("BOND_FILTER_LABEL — 끌림/결속/같은 결", () => {
  assert.equal(BOND_FILTER_LABEL.heavenly, "끌림");
  assert.equal(BOND_FILTER_LABEL.six, "결속");
  assert.equal(BOND_FILTER_LABEL.triad, "같은 결");
});

test("presentBondFilters — 존재하는 종류만, 순서 heavenly→six→triad", () => {
  const edges = [E("x", "y", true, false), E("y", "z", false, true)];
  const triads = [{ memberIds: ["a", "b", "c"] }];
  assert.deepEqual(presentBondFilters(edges, triads), ["heavenly", "six", "triad"]);
});

test("presentBondFilters — 없는 종류는 빠짐", () => {
  assert.deepEqual(presentBondFilters([E("x", "y", false, false)], []), []);
  assert.deepEqual(presentBondFilters([E("x", "y", false, true)], []), ["six"]);
});

test("edgeActiveForBond — 필터 없으면 전부, triad면 엣지 전부 비활성", () => {
  const e = E("x", "y", true, false);
  assert.equal(edgeActiveForBond(e, null), true);
  assert.equal(edgeActiveForBond(e, "heavenly"), true);
  assert.equal(edgeActiveForBond(e, "six"), false);
  assert.equal(edgeActiveForBond(e, "triad"), false);
});

test("precedence — 천간합+육합 엣지는 끌림으로 분류(결속·중복에서 제외)", () => {
  const both = E("x", "y", true, true);
  assert.equal(edgeActiveForBond(both, "heavenly"), true);
  assert.equal(edgeActiveForBond(both, "six"), false); // 둘 다면 결속 아님(끌림 우선)
  assert.deepEqual(presentBondFilters([both], []), ["heavenly"]); // both-bond만 있으면 결속 칩 미표시
  assert.equal(nodeActiveForBond("y", "six", [both], new Set()), false);
  assert.equal(nodeActiveForBond("y", "heavenly", [both], new Set()), true);
});

test("nodeActiveForBond — heavenly/six는 강조 엣지 끝점, triad는 삼합 멤버", () => {
  const edges = [E("me", "y", true, false), E("me", "z", false, true)];
  const triadIds = new Set(["me", "z", "w"]);
  assert.equal(nodeActiveForBond("y", "heavenly", edges, triadIds), true);
  assert.equal(nodeActiveForBond("z", "heavenly", edges, triadIds), false);
  assert.equal(nodeActiveForBond("z", "six", edges, triadIds), true);
  assert.equal(nodeActiveForBond("w", "triad", edges, triadIds), true);
  assert.equal(nodeActiveForBond("y", "triad", edges, triadIds), false);
  assert.equal(nodeActiveForBond("y", null, edges, triadIds), true);
});
