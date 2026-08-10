// lib/fortune/model.test.ts
// fortune one-shot 모델 정책 매핑 유닛. 무료 데일리=저가, 유료 리포트=sonnet.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fortuneModel, FORTUNE_CHEAP_MODEL } from "./model.ts";

describe("fortuneModel", () => {
  it("무료 데일리는 저가 모델", () => {
    assert.equal(fortuneModel("daily"), FORTUNE_CHEAP_MODEL);
    assert.equal(fortuneModel("tarot_daily"), FORTUNE_CHEAP_MODEL);
  });
  it("유료 리포트는 sonnet", () => {
    for (const t of ["monthly", "saju_full", "compat", "compat_social", "good_days"] as const) {
      assert.equal(fortuneModel(t), "claude-sonnet-5");
    }
  });
});
