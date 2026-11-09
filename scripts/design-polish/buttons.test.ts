import { test } from "node:test";
import assert from "node:assert/strict";
import { toButton } from "./buttons";

const to = (c: string) => { const r = toButton(c); return "to" in r ? r.to : `skip:${r.skip}`; };

test("주 버튼 — 폭 가득은 큰 버튼, 부품이 정하는 클래스는 지운다", () => {
  assert.equal(to("w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-15 hover:bg-lilac-deep/90 active:scale-[0.98] transition"), "btn btn-primary btn-lg");
  assert.equal(to("mt-4 block w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-15 text-center"), "btn btn-primary btn-lg mt-4");
  assert.equal(to("px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-14"), "btn btn-primary btn-md");
  assert.equal(to("shrink-0 px-3 py-1.5 bg-lilac-deep text-white rounded-full text-12 font-bold"), "btn btn-primary btn-sm shrink-0");
});
test("보조 버튼 — 흰 바탕 테두리 버튼", () => {
  assert.equal(to("w-full py-3 rounded-xl bg-white border border-lilac-mid/40 text-accent font-bold text-14 text-center"), "btn btn-secondary btn-lg");
});
test("글자 버튼 — 바탕 없는 폭 가득 버튼", () => {
  assert.equal(to("w-full py-4 bg-transparent hover:bg-lilac-deep/5 text-accent rounded-2xl font-bold text-15"), "btn btn-text btn-lg");
});
test("건너뛰는 것", () => {
  assert.match(to("w-full py-3.5 rounded-xl bg-[#FEE500] text-[#3C1E1E] font-bold"), /^skip:규정/);
  assert.match(to(`w-7 h-7 rounded-lg ${"$"}{on ? "bg-accent" : ""}`), /^skip:조건부/);
  assert.match(to("inline-flex items-center gap-1 text-12 text-text-light"), /^skip:버튼 크기/);
});
test("레이아웃 클래스는 남긴다", () => {
  assert.equal(to("flex-1 py-2.5 rounded-xl bg-lilac-deep text-white text-14 font-bold justify-between disabled:cursor-not-allowed"), "btn btn-primary btn-md flex-1 justify-between disabled:cursor-not-allowed");
});
