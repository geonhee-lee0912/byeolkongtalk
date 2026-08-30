// lib/fortune/report-schemas.test.ts
// 리포트 JSON 스키마의 OpenAI strict 불변식 검사: 모든 object 는 additionalProperties:false +
// 모든 property 가 required 에 포함. (개수 규칙은 스키마가 아니라 parseXReportJson 담당.)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SAJU_FULL_REPORT_SCHEMA } from "./saju-full-report.ts";
import { MONTHLY_REPORT_SCHEMA } from "./monthly-report.ts";
import { COMPAT_REPORT_SCHEMA, COMPAT_LOVE_REPORT_SCHEMA, COMPAT_SOCIAL_REPORT_SCHEMA } from "./compat-report.ts";

type JsonSchema = {
  type?: string;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
};

/** 모든 object 노드가 strict 규칙을 만족하는지 재귀 검사. 위반 경로 목록 반환. */
function strictViolations(node: JsonSchema, path = "$"): string[] {
  const out: string[] = [];
  if (node.type === "object") {
    if (node.additionalProperties !== false) out.push(`${path}: additionalProperties!=false`);
    const props = Object.keys(node.properties ?? {});
    const req = new Set(node.required ?? []);
    for (const p of props) if (!req.has(p)) out.push(`${path}.${p}: not in required`);
    for (const r of node.required ?? []) if (!props.includes(r)) out.push(`${path}.${r}: required key not in properties`);
    for (const p of props) out.push(...strictViolations(node.properties![p], `${path}.${p}`));
  }
  if (node.type === "array" && node.items) out.push(...strictViolations(node.items, `${path}[]`));
  return out;
}

describe("report schemas — OpenAI strict 불변식", () => {
  for (const [name, schema] of [
    ["saju_full", SAJU_FULL_REPORT_SCHEMA],
    ["monthly", MONTHLY_REPORT_SCHEMA],
    ["compat", COMPAT_REPORT_SCHEMA],
    ["compat_love", COMPAT_LOVE_REPORT_SCHEMA],
    ["compat_social", COMPAT_SOCIAL_REPORT_SCHEMA],
  ] as const) {
    it(`${name}: 전 object additionalProperties:false + 전 property required`, () => {
      assert.deepEqual(strictViolations(schema as unknown as JsonSchema), []);
    });
  }

  it("saju_full 최상위 필드 집합이 인터페이스와 일치", () => {
    const req = (SAJU_FULL_REPORT_SCHEMA as unknown as JsonSchema).required!.slice().sort();
    assert.deepEqual(req, [
      "actions", "careerDeep", "elementUsage", "halves", "healthDeep", "loveDeep",
      "lucky", "mission", "monthly", "note", "opportunities", "pitfalls", "quarters",
      "relations2026", "relationsDeep", "remedies", "self", "selfcare", "summary",
      "theme", "timing", "turning", "wealthDeep", "year",
    ]);
  });
});
