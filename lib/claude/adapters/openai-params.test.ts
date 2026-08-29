// lib/claude/adapters/openai-params.test.ts
// OpenAI response_format 조립 헬퍼 유닛 — responseFormat 유무에 따른 파라미터 분기.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openaiResponseFormat } from "./openai.ts";

describe("openaiResponseFormat", () => {
  it("responseFormat 없으면 빈 객체(=create 파라미터에 response_format 미주입)", () => {
    assert.deepEqual(openaiResponseFormat(undefined), {});
  });
  it("responseFormat 있으면 json_schema strict 로 감싼다", () => {
    const schema = { type: "object", additionalProperties: false, properties: {}, required: [] };
    const out = openaiResponseFormat({ name: "x_report", schema });
    assert.deepEqual(out, {
      response_format: {
        type: "json_schema",
        json_schema: { name: "x_report", strict: true, schema },
      },
    });
  });
});
