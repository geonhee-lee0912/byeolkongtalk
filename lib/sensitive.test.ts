import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSensitive, type SensitiveMatch } from "./sensitive.ts";

// 2026-07-21 prod 오탐 실문장 — regex 로는 medium(끝내고 싶)/low(못버티) 매칭
const FP_BREAKUP = "나와 끝내고 싶은건지. 다른문제인지. 다른 여자가 있는건지.";
const FP_ENDURE = "난 이 침묵의 이유도 모르겠고 더는 못버티겠으니, 만나서 얘기를 하고싶다.";

const crisisMatch: SensitiveMatch = {
  category: "suicide",
  severity: 2,
  matchedKeywords: ["끝내고 싶"],
  method: "both",
  certainty: "medium",
};

test("매칭 없는 평범한 문장 → null, 2차 판정 호출 안 함", async () => {
  let called = false;
  const r = await resolveSensitive("오늘 타로 봐줘", {
    secondPass: async () => ((called = true), null),
  });
  assert.equal(r, null);
  assert.equal(called, false);
});

test("high certainty (죽고 싶어) → 2차 없이 즉시 반환", async () => {
  let called = false;
  const r = await resolveSensitive("요즘 너무 죽고 싶어", {
    secondPass: async () => ((called = true), null),
  });
  assert.equal(r?.category, "suicide");
  assert.equal(r?.certainty, "high");
  assert.equal(called, false);
});

test("회색지대 + 2차 '위기 아님' → null (오탐 차단)", async () => {
  const r = await resolveSensitive(FP_BREAKUP, {
    secondPass: async () => null,
  });
  assert.equal(r, null);
});

test("회색지대 + 2차 위기 확정 → 2차 결과 반환", async () => {
  const r = await resolveSensitive(FP_ENDURE, {
    secondPass: async () => crisisMatch,
  });
  assert.equal(r, crisisMatch);
});

test("2차 타임아웃 → regex 결과 폴백 (안전한 방향)", async () => {
  const r = await resolveSensitive(FP_BREAKUP, {
    secondPass: () => new Promise(() => {}),
    timeoutMs: 50,
  });
  assert.equal(r?.category, "suicide");
  assert.equal(r?.method, "regex");
});

test("2차 실패(reject) → regex 결과 폴백", async () => {
  const r = await resolveSensitive(FP_BREAKUP, {
    secondPass: async () => {
      throw new Error("api down");
    },
  });
  assert.equal(r?.category, "suicide");
  assert.equal(r?.method, "regex");
});
