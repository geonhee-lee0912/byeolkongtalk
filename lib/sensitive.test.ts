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

// 2026-10-11 high 정규식 권장안 — 약·사진 올려·무시 같은 애매한 문장은 regex high(즉시 위기 확정)가 아니라 스트림 전 2차 판정으로 간다
test("진짜 과다복용 문장 → 2차 없이 즉시 high (옛 정규식은 활용형 때문에 null 이라 놓쳤다)", async () => {
  let called = false;
  const r = await resolveSensitive("수면제 한 통 다 먹었어", {
    secondPass: async () => ((called = true), null),
  });
  assert.equal(r?.category, "suicide");
  assert.equal(r?.certainty, "high");
  assert.equal(called, false);
});

test("감기약 먹고 잤다 → regex 는 medium 이라 2차 판정을 부르고, '위기 아님' 이면 null (옛 정규식은 high 로 위기 모드 확정)", async () => {
  let calls = 0;
  const r = await resolveSensitive("감기약 먹고 일찍 잤어", {
    secondPass: async () => (calls++, null),
  });
  assert.equal(r, null);
  assert.equal(calls, 1);
});

test("약속 잡고 밥 먹고 왔다 → regex 가 아예 안 잡는다 (2차 판정도 안 부른다)", async () => {
  let called = false;
  const r = await resolveSensitive("약속 잡고 밥 먹고 들어왔어", {
    secondPass: async () => ((called = true), null),
  });
  assert.equal(r, null);
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
