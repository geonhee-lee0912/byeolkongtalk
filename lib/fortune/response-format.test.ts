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
  it("compat/compat_social 별도 스키마 — 연애색 필드로 구분 (2026-08-30 분리·리워크)", () => {
    assert.notEqual(fortuneResponseFormat("compat")!.schema, fortuneResponseFormat("compat_social")!.schema);
    const loveReq = (fortuneResponseFormat("compat")!.schema as { required?: string[] }).required ?? [];
    const socialReq = (fortuneResponseFormat("compat_social")!.schema as { required?: string[] }).required ?? [];
    // 관계-중립 카테고리는 둘 다 포함
    for (const f of ["individual", "stages", "repair", "warningSigns", "badHabits", "spark"]) {
      assert.ok(loveReq.includes(f), `compat 에 ${f} 있어야`);
      assert.ok(socialReq.includes(f), `compat_social 에 ${f} 있어야`);
    }
    // 연애색 카테고리는 compat 만
    for (const f of ["loveLanguage", "intimacy"]) {
      assert.ok(loveReq.includes(f), `compat 에 ${f} 있어야`);
      assert.ok(!socialReq.includes(f), `compat_social 엔 ${f} 없어야(연애색)`);
    }
  });
  it("good_days(마크다운)·daily(nano)·tarot(비활성)은 undefined", () => {
    for (const t of ["good_days", "daily", "tarot_daily", "tarot_love", "tarot_money", "tarot_career", "tarot_relation"] as const) {
      assert.equal(fortuneResponseFormat(t), undefined);
    }
  });
});
