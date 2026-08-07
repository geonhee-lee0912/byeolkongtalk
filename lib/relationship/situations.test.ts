// lib/relationship/situations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SITUATIONS, getSituations, getSituation, type SimSituation } from "./situations.ts";

test("스타터 8개 — 관계당 2개(any 제외)", () => {
  assert.equal(SITUATIONS.length, 8);
  const byRel = SITUATIONS.reduce<Record<string, number>>((m, s) => ((m[s.relationship] = (m[s.relationship] ?? 0) + 1), m), {});
  assert.equal(byRel.crush, 2);
  assert.equal(byRel.dating, 2);
  assert.equal(byRel.onesided, 2);
  assert.equal(byRel.breakup, 2);
});

test("모든 seed 필드가 비어있지 않다 (엔진 주입 대상)", () => {
  for (const s of SITUATIONS) {
    for (const k of ["id", "emoji", "label", "desc", "dollStance", "opening", "contextPrompt"] as const) {
      assert.ok((s[k] as string).trim().length > 0, `${s.id}.${k} 비어있음`);
    }
  }
});

test("id 는 유일", () => {
  assert.equal(new Set(SITUATIONS.map((s) => s.id)).size, SITUATIONS.length);
});

test("이별·짝사랑은 safety=high 코호트 (스펙 §4·§6)", () => {
  for (const s of SITUATIONS.filter((x) => x.relationship === "breakup" || x.relationship === "onesided")) {
    assert.equal(s.safety, "high", `${s.id} 는 high 여야`);
  }
});

test("getSituations(관계) = 해당 관계 + any", () => {
  const crush = getSituations("crush");
  assert.ok(crush.every((s) => s.relationship === "crush" || s.relationship === "any"));
  assert.equal(crush.filter((s) => s.relationship === "crush").length, 2);
});

test("getSituation(id) 왕복 + 미존재 null", () => {
  assert.equal(getSituation("breakup-reconnect")?.label, "재회 연락");
  assert.equal(getSituation("nope"), null);
});

test("자유쓰기 custom — getter 노출 + generic(any·high)", () => {
  assert.equal(getSituation("custom")?.label, "직접 쓰기");
  const crush = getSituations("crush");
  assert.ok(crush.some((s) => s.id === "custom"), "모든 관계에 custom 노출");
  assert.equal(getSituation("custom")?.safety, "high");
});
