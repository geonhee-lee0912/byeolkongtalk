// qa/evaluate/judge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJudgeResult, buildJudgePrompt } from "./judge.ts";
import type { Transcript } from "../types.ts";

const t: Transcript = {
  caseId: "x",
  product: { kind: "saju", sajuProduct: "today_letters" },
  readingId: "r",
  cost: 20,
  startBalance: 100,
  endBalance: 80,
  turns: [
    { userText: "이직?", assistantText: "흐름이 보여 [END]", headers: {}, status: 200, eventType: "say" },
  ],
  finishReason: "ended",
};

test("buildJudgePrompt: 7차원 + 트랜스크립트 포함", () => {
  const p = buildJudgePrompt(t);
  assert.ok(p.includes("단정적 예언"));
  assert.ok(p.includes("마무리 적절성"));
  assert.ok(p.includes("이직?"));
  assert.ok(p.includes("흐름이 보여"));
});

test("parseJudgeResult: 정상 JSON", () => {
  const raw = JSON.stringify({
    dimensions: [{ dimension: "단정적 예언 금지", pass: true, evidence: "ok" }],
    summary: "좋음",
  });
  const r = parseJudgeResult(raw);
  assert.equal(r.overallPass, true);
  assert.equal(r.dimensions.length, 1);
});

test("parseJudgeResult: fail 하나라도 있으면 overallPass=false", () => {
  const raw = JSON.stringify({
    dimensions: [
      { dimension: "a", pass: true, evidence: "" },
      { dimension: "b", pass: false, evidence: "위반" },
    ],
    summary: "",
  });
  assert.equal(parseJudgeResult(raw).overallPass, false);
});

test("parseJudgeResult: 깨진 JSON이면 빈 결과 + overallPass false", () => {
  const r = parseJudgeResult("쓰레기");
  assert.equal(r.overallPass, false);
  assert.equal(r.dimensions.length, 0);
});
