// qa/report.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummaryMd } from "./report.ts";
import type { CaseResult } from "./types.ts";

const results: CaseResult[] = [
  {
    transcript: {
      caseId: "saju.today_letters.happy_path",
      product: { kind: "saju", sajuProduct: "today_letters" },
      readingId: "r1", cost: 20, startBalance: 100, endBalance: 80,
      turns: [{ userText: "고민", assistantText: "풀이 [END]", headers: {}, status: 200, eventType: "say" }],
      finishReason: "ended",
    },
    assertions: [{ name: "ended", pass: true, detail: "ok" }],
    judge: { dimensions: [{ dimension: "마무리 적절성", pass: false, evidence: "갑작스러움" }], overallPass: false, summary: "마무리 어색" },
  },
];

test("buildSummaryMd: 통과/플래그 카운트 + 케이스 id 포함", () => {
  const md = buildSummaryMd(results);
  assert.ok(md.includes("saju.today_letters.happy_path"));
  assert.ok(md.includes("마무리 적절성"));
  assert.ok(md.includes("갑작스러움"));
});
