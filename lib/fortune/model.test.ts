// lib/fortune/model.test.ts
// fortune one-shot 모델 정책 매핑 유닛. daily 는 별마루 유료 오늘 사주(P6-2 luna 상향), tarot_daily(비활성 무료)만 nano.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fortuneModel, FORTUNE_CHEAP_MODEL, FORTUNE_REPORT_MODEL } from "./model.ts";

describe("fortuneModel", () => {
  it("daily(별마루 유료 오늘 사주)는 luna — 다른 유료 리포트와 같은 모델(P6-2 스펙 §6-1 정합성 복구)", () => {
    assert.equal(fortuneModel("daily"), FORTUNE_REPORT_MODEL);
  });
  it("tarot_daily(비활성 무료 잔재)만 저가 모델(nano)", () => {
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
