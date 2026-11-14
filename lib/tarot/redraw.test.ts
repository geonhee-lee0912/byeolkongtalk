import { test } from "node:test";
import assert from "node:assert/strict";
import { redrawTarget } from "./redraw";

test("고민과 태그가 있으면 이 고민을 넘겨 스프레드 고르기로 간다", () => {
  assert.deepEqual(redrawTarget("연락이 뜸해졌어", "걔 속마음이 궁금해"), {
    href: "/tarot",
    pending: { emotion: "걔 속마음이 궁금해", concern: "연락이 뜸해졌어", type: "tarot" },
  });
});

test("옛 태그는 지금 태그로 바꿔 넘긴다", () => {
  assert.equal(redrawTarget("고민", "그 사람 마음이 궁금해").pending?.emotion, "걔 속마음이 궁금해");
});

test("태그를 모르면 고민 적기로 보낸다(스프레드 고르기는 태그가 있어야 한다)", () => {
  assert.deepEqual(redrawTarget("고민", null), { href: "/concern", pending: null });
  assert.deepEqual(redrawTarget("고민", "없는 태그"), { href: "/concern", pending: null });
});

test("고민이 비어 있으면 고민 적기로 보낸다", () => {
  assert.deepEqual(redrawTarget("  ", "걔 속마음이 궁금해"), { href: "/concern", pending: null });
});
