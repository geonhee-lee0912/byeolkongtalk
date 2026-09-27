import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_GUIDE_SPEC, SECTION_GUIDE } from "./prompt.ts";

test("공용 12종 — spec 의 heading 이 실제 프롬프트 문자열에 그대로 들어간다", () => {
  for (const [type, spec] of Object.entries(GENERIC_GUIDE_SPEC)) {
    const prompt = SECTION_GUIDE[type as keyof typeof SECTION_GUIDE];
    for (const s of spec.sections) {
      assert.ok(
        prompt.includes(`"heading": "${s.heading}"`),
        `${type}: heading "${s.heading}" 이 프롬프트에 없다`
      );
    }
  }
});

test("공용 12종 목록이 줄지 않는다", () => {
  assert.equal(Object.keys(GENERIC_GUIDE_SPEC).length, 12);
});
