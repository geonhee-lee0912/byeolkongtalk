// lib/fortune/response-format.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fortuneResponseFormat } from "./response-format.ts";

describe("fortuneResponseFormat", () => {
  it("활성 JSON 리포트 4종은 responseFormat 반환", () => {
    for (const t of ["saju_full", "monthly", "compat", "compat_social"] as const) {
      const rf = fortuneResponseFormat(t);
      assert.ok(rf, `${t} 는 responseFormat 있어야`);
      assert.equal(typeof rf!.name, "string");
      assert.equal((rf!.schema as { type?: string }).type, "object");
    }
  });
  it("compat/compat_social 은 같은 스키마 공유", () => {
    assert.equal(fortuneResponseFormat("compat")!.schema, fortuneResponseFormat("compat_social")!.schema);
  });
  it("good_days(마크다운)·daily(nano)·tarot(비활성)은 undefined", () => {
    for (const t of ["good_days", "daily", "tarot_daily", "tarot_love", "tarot_money", "tarot_career", "tarot_relation"] as const) {
      assert.equal(fortuneResponseFormat(t), undefined);
    }
  });
});
