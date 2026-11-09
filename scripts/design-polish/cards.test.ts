import { test } from "node:test";
import assert from "node:assert/strict";
import { toCard } from "./cards";

const to = (c: string, sheet = false) => { const r = toCard(c, sheet); return "to" in r ? r.to : `skip:${r.skip}`; };

test("바닥 카드 — 테두리·반투명·임의 여백을 지우고 card 로", () => {
  assert.equal(to("bg-white rounded-2xl p-3.5 border border-lilac-mid/20 shadow-card flex gap-3 items-start"), "card flex gap-3 items-start");
  assert.equal(to("flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"), "card flex items-center gap-3.5 transition");
});
test("글 많은 카드는 card-report", () => {
  assert.equal(to("bg-white rounded-2xl border border-lilac-mid/20 shadow-card px-[22px] py-6"), "card-report");
});
test("다른 판(카드·시트) 위의 칸은 card-inner, 크림 화면 위면 바닥 카드", () => {
  assert.equal(to("bg-cream-warm rounded-2xl px-3 py-5 border border-lilac-mid/30", true), "card-inner");
  assert.equal(to("bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30"), "card");
  assert.equal(to("bg-white rounded-2xl p-4 mb-3", true), "card-inner mb-3");
  assert.equal(to("flex items-center justify-between rounded-xl border border-lilac-mid/25 bg-white/70 px-3.5 py-2.5 mb-2", true), "card-inner flex items-center justify-between mb-2");
});
test("건너뛰는 것", () => {
  assert.match(to("w-12 h-12 rounded-xl bg-white flex items-center justify-center"), /^skip:/);
  assert.match(to("px-4 py-2 rounded-full bg-white/90 text-14"), /^skip:/);
  assert.match(to("btn btn-secondary btn-lg"), /^skip:이미/);
  assert.match(to(`rounded-2xl p-4 ${"$"}{on ? "bg-white" : ""}`), /^skip:조건부/);
});
