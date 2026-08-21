import { test } from "node:test";
import assert from "node:assert/strict";
import { inyeonScore, inyeonGrade, inyeonReasons, inyeonComment } from "./inyeon.ts";

const mk = (o: Partial<Parameters<typeof inyeonScore>[0]> = {}) => ({
  element: "생아", heavenlyCombo: false, sixCombo: false, triadShared: false, ...o,
});

test("inyeonScore — 오행 base(상생·상극 62, 비화 50)", () => {
  assert.equal(inyeonScore(mk({ element: "비화" })), 50);
  assert.equal(inyeonScore(mk({ element: "생아" })), 62);
  assert.equal(inyeonScore(mk({ element: "아생" })), 62);
  assert.equal(inyeonScore(mk({ element: "극아" })), 62);
  assert.equal(inyeonScore(mk({ element: "아극" })), 62);
});

test("inyeonScore — 특별관계 가점 + cap 100", () => {
  assert.equal(inyeonScore(mk({ element: "생아", heavenlyCombo: true })), 87);
  assert.equal(inyeonScore(mk({ element: "비화", sixCombo: true })), 65);
  assert.equal(inyeonScore(mk({ element: "생아", heavenlyCombo: true, sixCombo: true, triadShared: true })), 100);
});

test("inyeonScore — 미지 오행은 비화 취급(방어)", () => {
  assert.equal(inyeonScore(mk({ element: "??" })), 50);
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
