import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORTUNE_CONFIG,
  FORTUNE_CATEGORY,
  FORTUNE_CHIPS,
  FORTUNE_LIST,
  DEFAULT_FORTUNE_CHIP,
  fortuneProductsByCategory,
} from "./types.ts";

test("오늘의 운세는 완전 무료 — 무료 한도·유료 전환 없음", () => {
  const daily = FORTUNE_CONFIG.daily;
  assert.equal(daily.cost, 0);
  assert.equal(daily.freeLimit, undefined);
  assert.equal(daily.paidCost, undefined);
});

test("진열 상품이 정확한 카테고리에 매핑된다", () => {
  assert.equal(FORTUNE_CATEGORY.compat, "love_relation");
  assert.equal(FORTUNE_CATEGORY.compat_social, "love_relation");
  assert.equal(FORTUNE_CATEGORY.saju_full, "timing");
  assert.equal(FORTUNE_CATEGORY.monthly, "timing");
  assert.equal(FORTUNE_CATEGORY.good_days, "timing");
  assert.equal(FORTUNE_CATEGORY.daily, "free");
});

test("연애·관계 = 궁합 2종 + 신규 3종 (FORTUNE_LIST 순서 보존)", () => {
  const love = fortuneProductsByCategory("love_relation").map((f) => f.type);
  assert.deepEqual(love, ["compat", "compat_social", "love_self", "love_year", "marriage"]);
});

test("신규 칩 — 나·돈일·재미 매핑", () => {
  assert.deepEqual(
    fortuneProductsByCategory("identity").map((f) => f.type),
    ["nature_self", "talent_path", "user_manual", "element_balance", "life_full"]
  );
  assert.deepEqual(
    fortuneProductsByCategory("money_work").map((f) => f.type),
    ["wealth_vessel", "wealth_year", "career_timing"]
  );
  assert.deepEqual(
    fortuneProductsByCategory("fun").map((f) => f.type),
    ["fact_bomb", "past_life", "saju_report_card", "life_graph"]
  );
});

test("타이밍엔 daily 없음, 2026 사주 포함", () => {
  const timing = fortuneProductsByCategory("timing").map((f) => f.type);
  assert.ok(!timing.includes("daily"));
  assert.ok(timing.includes("saju_full"));
});

test("2탭 유료 전용화 — 무료 칩 제거 · daily 진열 은퇴", () => {
  assert.ok(!FORTUNE_LIST.some((f) => f.type === "daily"), "FORTUNE_LIST 에 daily 없음");
  assert.ok(!FORTUNE_CHIPS.some((c) => c.key === "free"), "FORTUNE_CHIPS 에 free 칩 없음");
  assert.equal(FORTUNE_CONFIG.daily.active, false, "daily active:false 은퇴");
  assert.equal(FORTUNE_CATEGORY.daily, "free", "daily category 레코드는 보존");
});

test("칩 5개 · 순서 · 기본은 연애·관계", () => {
  assert.deepEqual(
    FORTUNE_CHIPS.map((c) => c.key),
    ["love_relation", "identity", "fun", "money_work", "timing"]
  );
  assert.equal(DEFAULT_FORTUNE_CHIP, "love_relation");
});
