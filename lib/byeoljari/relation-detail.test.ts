import { test } from "node:test";
import assert from "node:assert/strict";
import { relationDetail } from "./relation-detail.ts";

test("relationDetail — 생아 기본", () => {
  const d = relationDetail("생아", {});
  assert.equal(d.prose, "곁에 있으면 기운을 받아 힘이 나는 사이");
  assert.ok(d.good && d.caution);
  assert.deepEqual(d.keywords, ["보완", "안정"]);
});

test("relationDetail — 특별 인연 키워드 append", () => {
  const d = relationDetail("극아", { heavenlyCombo: true, triadShared: true });
  assert.ok(d.keywords.includes("자극"));
  assert.ok(d.keywords.includes("끌림"));
  assert.ok(d.keywords.includes("같은 결"));
  assert.ok(!d.keywords.includes("결속"));
});

test("relationDetail — 미지 element 폴백", () => {
  const d = relationDetail("?", {});
  assert.equal(d.prose, "이어져 있는 사이");
  assert.deepEqual(d.keywords, []);
});
