import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCardId } from "./daily-card.ts";

test("isValidCardId: 0~77 만 허용", () => {
  assert.equal(isValidCardId(0), true);
  assert.equal(isValidCardId(77), true);
  assert.equal(isValidCardId(78), false);
  assert.equal(isValidCardId(-1), false);
  assert.equal(isValidCardId(1.5), false);
});
