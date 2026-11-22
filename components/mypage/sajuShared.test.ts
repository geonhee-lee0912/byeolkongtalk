import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcSaju } from "@/lib/saju/calc";
import { birthTimeForSubmit, birthTimeToBranchHour, birthTimeToSijin } from "./sajuShared";

const NAMES = ["자시", "축시", "인시", "묘시", "진시", "사시", "오시", "미시", "신시", "유시", "술시", "해시"];

test("시각 → 12시진 칸: 24시간 전부 시진 이름과 같은 칸", () => {
  for (let h = 0; h < 24; h++) {
    const t = `${String(h).padStart(2, "0")}:30`;
    const branch = birthTimeToBranchHour(t);
    assert.ok(branch !== null);
    assert.ok(birthTimeToSijin(t)?.startsWith(NAMES[branch / 2]), `${t} -> ${branch}`);
  }
});

test("자동 채운 칸을 안 바꿨으면 저장된 시각 그대로 — 사주가 같다(23시 다음날 일주 포함)", () => {
  const base = { year: 1996, month: 5, day: 15, isLunar: false, isLeapMonth: false, gender: "other" as const };
  for (const t of ["13:47", "23:30", "07:10", "00:20", "14:00"]) {
    const sent = birthTimeForSubmit(birthTimeToBranchHour(t), t);
    const saved = calcSaju({ ...base, hour: Number(t.slice(0, 2)), minute: Number(t.slice(3, 5)) }).pillars;
    assert.deepEqual(calcSaju({ ...base, ...sent }).pillars, saved, t);
  }
});

test("칸을 바꿨거나 저장된 시각이 없으면 고른 칸 값", () => {
  assert.deepEqual(birthTimeForSubmit(8, "13:47"), { hour: 8, minute: 0 });
  assert.deepEqual(birthTimeForSubmit(8, null), { hour: 8, minute: 0 });
  assert.deepEqual(birthTimeForSubmit(null, "13:47"), { hour: null, minute: null });
});

test("사주 MBTI 생일 화면이 저장된 시각을 넘긴다", () => {
  assert.match(readFileSync("components/saju-mbti/BirthStage.tsx", "utf8"), /birthTimeForSubmit\(/);
});
