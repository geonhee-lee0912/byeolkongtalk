import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseBlocks } from "./markdown-lite.tsx";

test("parseInline: **볼드** 런 분리", () => {
  assert.deepEqual(parseInline("a **b** c"), [
    { t: "text", s: "a " },
    { t: "b", s: "b" },
    { t: "text", s: " c" },
  ]);
  assert.deepEqual(parseInline("plain"), [{ t: "text", s: "plain" }]);
});

test("parseBlocks: 빈 줄로 문단 분리", () => {
  const b = parseBlocks("첫 문단\n\n둘째 문단");
  assert.equal(b.length, 2);
  assert.equal(b[0].t, "p");
  assert.equal(b[1].t, "p");
});

test("parseBlocks: '- ' 연속 줄은 불릿 리스트", () => {
  const b = parseBlocks("- 하나\n- 둘");
  assert.equal(b.length, 1);
  assert.equal(b[0].t, "ul");
  assert.equal(b[0].t === "ul" ? b[0].items.length : 0, 2);
});

test("parseBlocks: 일반 여러 줄은 한 문단으로 합침", () => {
  const b = parseBlocks("줄1\n줄2");
  assert.equal(b.length, 1);
  assert.equal(b[0].t, "p");
});
