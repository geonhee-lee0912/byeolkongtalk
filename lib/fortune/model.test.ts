// lib/fortune/model.test.ts
// fortune one-shot 모델 정책 매핑 유닛. 무료 데일리=저가(nano), 나머지=luna 리포트 모델.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fortuneModel, FORTUNE_CHEAP_MODEL, FORTUNE_REPORT_MODEL } from "./model.ts";

describe("fortuneModel", () => {
  it("무료 데일리는 저가 모델(nano)", () => {
    assert.equal(fortuneModel("daily"), FORTUNE_CHEAP_MODEL);
    assert.equal(fortuneModel("tarot_daily"), FORTUNE_CHEAP_MODEL);
  });
  it("유료 리포트 5종은 luna 리포트 모델", () => {
    for (const t of ["monthly", "saju_full", "compat", "compat_social", "good_days"] as const) {
      assert.equal(fortuneModel(t), FORTUNE_REPORT_MODEL);
    }
  });
  it("비활성 타로 리포트도 규칙상 luna 로 라우팅", () => {
    for (const t of ["tarot_love", "tarot_money", "tarot_career", "tarot_relation"] as const) {
      assert.equal(fortuneModel(t), FORTUNE_REPORT_MODEL);
    }
  });
});
