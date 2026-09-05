// lib/byeolmaru/watch.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { watchAllowance } from "./watch.ts";
import { WATCH_FREE_SLOTS } from "./constants.ts";

test("watchAllowance: 무료 기본 + 구매분 가산", () => {
  assert.equal(watchAllowance(0), WATCH_FREE_SLOTS);       // 2
  assert.equal(watchAllowance(1), WATCH_FREE_SLOTS + 1);   // 3
  assert.equal(watchAllowance(3), WATCH_FREE_SLOTS + 3);   // 5
});
