import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORTUNE_CATEGORY,
  FORTUNE_CHIPS,
  DEFAULT_FORTUNE_CHIP,
  fortuneProductsByCategory,
} from "./types.ts";

test("진열 상품이 정확한 카테고리에 매핑된다", () => {
  assert.equal(FORTUNE_CATEGORY.compat, "love_relation");
  assert.equal(FORTUNE_CATEGORY.compat_social, "love_relation");
  assert.equal(FORTUNE_CATEGORY.saju_full, "timing");
  assert.equal(FORTUNE_CATEGORY.monthly, "timing");
  assert.equal(FORTUNE_CATEGORY.good_days, "timing");
  assert.equal(FORTUNE_CATEGORY.daily, "free");
});

test("연애·관계 = 궁합 2종 (FORTUNE_LIST 순서 보존)", () => {
  const love = fortuneProductsByCategory("love_relation").map((f) => f.type);
  assert.deepEqual(love, ["compat", "compat_social"]);
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

test("칩 3개 · 순서 · 기본은 타이밍", () => {
  assert.deepEqual(
    FORTUNE_CHIPS.map((c) => c.key),
    ["love_relation", "timing", "free"]
  );
  assert.equal(DEFAULT_FORTUNE_CHIP, "timing");
});
