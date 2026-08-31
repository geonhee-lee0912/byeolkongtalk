import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseBlocks, splitLongParagraph } from "./markdown-lite.tsx";

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

test("splitLongParagraph: 4문장 이하는 그대로", () => {
  const t = "가. 나. 다.";
  assert.deepEqual(splitLongParagraph(t), [t]);
});

test("splitLongParagraph: 5문장 이상은 3문장씩 분할", () => {
  const out = splitLongParagraph("가나. 다라. 마바. 사아. 자차.");
  assert.equal(out.length, 2);
  assert.equal(out[0], "가나. 다라. 마바.");
  assert.equal(out[1], "사아. 자차.");
});

test("parseBlocks: 긴 단일 문단(마크다운 없음)도 자동 분할", () => {
  const b = parseBlocks("하나. 둘. 셋. 넷. 다섯. 여섯.");
  assert.equal(b.length, 2);
  assert.ok(b.every((x) => x.t === "p"));
});

test("parseBlocks: '> ' 는 콜아웃 블록", () => {
  const b = parseBlocks("> 이게 핵심 팁이야");
  assert.equal(b.length, 1);
  assert.equal(b[0].t, "callout");
  const c = b[0];
  assert.equal(c.t === "callout" ? c.parts[0].s : "", "이게 핵심 팁이야");
});

// 실제 버그: 불릿 여러 줄 + 콜아웃 한 줄이 빈 줄 없이 한 블록 → 통째 줄글이 되던 것.
test("parseBlocks: 불릿 + 콜아웃 한 블록도 각각 분리(줄글 버그 방지)", () => {
  const b = parseBlocks("- 하나\n- 둘\n- 셋\n> 핵심 팁");
  assert.equal(b.length, 2);
  assert.equal(b[0].t, "ul");
  assert.equal(b[0].t === "ul" ? b[0].items.length : 0, 3);
  assert.equal(b[1].t, "callout");
});

test("parseBlocks: 도입 문장 + 불릿(빈 줄 없음)도 분리", () => {
  const b = parseBlocks("강점은 이런 게 있어:\n- 하나\n- 둘");
  assert.equal(b.length, 2);
  assert.equal(b[0].t, "p");
  assert.equal(b[1].t, "ul");
  assert.equal(b[1].t === "ul" ? b[1].items.length : 0, 2);
});

test("parseBlocks: 문단+불릿+콜아웃+문단 혼합 순서 보존", () => {
  const b = parseBlocks("도입 문장.\n- 하나\n- 둘\n> 팁\n\n다음 문단.");
  assert.deepEqual(b.map((x) => x.t), ["p", "ul", "callout", "p"]);
});
