import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORTUNE_CONFIG,
  FORTUNE_CATEGORY,
  FORTUNE_CHIPS,
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

test("무료 칩엔 오늘의 운세만", () => {
  const free = fortuneProductsByCategory("free").map((f) => f.type);
  assert.deepEqual(free, ["daily"]);
});

test("칩 6개 · 순서 · 기본은 타이밍", () => {
  assert.deepEqual(
    FORTUNE_CHIPS.map((c) => c.key),
    ["love_relation", "identity", "money_work", "timing", "fun", "free"]
  );
  assert.equal(DEFAULT_FORTUNE_CHIP, "timing");
});
