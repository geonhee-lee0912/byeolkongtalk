import { test } from "node:test";
import assert from "node:assert/strict";
import { inyeonScore, inyeonGrade, inyeonReasons, inyeonComment } from "./inyeon.ts";

const mk = (o: Partial<Parameters<typeof inyeonScore>[0]> = {}) => ({
  element: "생아", heavenlyCombo: false, sixCombo: false, triadShared: false, ...o,
});

test("inyeonScore — 오행 base(상생·상극 58, 비화 46, 십신 없으면 텍스처 0)", () => {
  assert.equal(inyeonScore(mk({ element: "비화" })), 46);
  assert.equal(inyeonScore(mk({ element: "생아" })), 58);
  assert.equal(inyeonScore(mk({ element: "아생" })), 58);
  assert.equal(inyeonScore(mk({ element: "극아" })), 58);
  assert.equal(inyeonScore(mk({ element: "아극" })), 58);
});

test("inyeonScore — 특별관계 가점 + cap 100", () => {
  assert.equal(inyeonScore(mk({ element: "생아", heavenlyCombo: true })), 83);
  assert.equal(inyeonScore(mk({ element: "비화", sixCombo: true })), 61);
  assert.equal(inyeonScore(mk({ element: "생아", heavenlyCombo: true, sixCombo: true, triadShared: true })), 100);
});

test("inyeonScore — 십신 텍스처(동점 완화, 양방향 TEX 합의 절반)", () => {
  assert.equal(inyeonScore(mk({ element: "생아", tenGodAtoB: "정인", tenGodBtoA: "식신" })), 60); // (0+3)/2→2
  assert.equal(inyeonScore(mk({ element: "생아", tenGodAtoB: "편인", tenGodBtoA: "상관" })), 64); // (5+7)/2→6
  assert.equal(inyeonScore(mk({ element: "생아", tenGodAtoB: "??", tenGodBtoA: "??" })), 58); // 미지 십신=0
});

test("inyeonScore — 연·월 기둥 조화 가점(4×개)", () => {
  assert.equal(inyeonScore(mk({ element: "생아", extraPillarHarmony: 2 })), 66); // 58 + 2*4
  assert.equal(inyeonScore(mk({ element: "비화", extraPillarHarmony: 1 })), 50); // 46 + 4
});

test("inyeonScore — 미지 오행은 비화 취급(방어)", () => {
  assert.equal(inyeonScore(mk({ element: "??" })), 46);
});

test("inyeonGrade — 경계", () => {
  assert.equal(inyeonGrade(85).tone, "high");
  assert.equal(inyeonGrade(84).tone, "mid");
  assert.equal(inyeonGrade(70).tone, "mid");
  assert.equal(inyeonGrade(69).tone, "low");
  assert.equal(inyeonGrade(55).tone, "low");
  assert.equal(inyeonGrade(54).tone, "faint");
});

test("inyeonGrade — 등급명", () => {
  assert.equal(inyeonGrade(85).label, "하늘이 맺은 인연");
  assert.equal(inyeonGrade(70).label, "깊은 인연");
  assert.equal(inyeonGrade(55).label, "이어진 인연");
  assert.equal(inyeonGrade(54).label, "잔잔한 인연");
});

test("inyeonReasons — 특별관계 + 오행 결", () => {
  const r = inyeonReasons(mk({ element: "생아", heavenlyCombo: true }));
  assert.ok(r.some((s) => s.includes("케미 스파크")));
  assert.ok(r.some((s) => s.includes("북돋아")));
});

test("inyeonReasons — 특별관계 없으면 오행 한 줄만", () => {
  assert.equal(inyeonReasons(mk({ element: "비화" })).length, 1);
});

test("inyeonComment — 모든 톤 비어있지 않음", () => {
  for (const t of ["high", "mid", "low", "faint"] as const) {
    assert.ok(inyeonComment(t).length > 0);
  }
});
