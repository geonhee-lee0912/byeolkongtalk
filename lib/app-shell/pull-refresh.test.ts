import { test } from "node:test";
import assert from "node:assert/strict";
import { pullDistance, shouldRefresh, PULL_REFRESH_AT } from "./pull-refresh.ts";

test("맨 위가 아니면 0", () => {
  assert.equal(pullDistance(0, 200, 1), 0);
});

test("위로 끌면 0", () => {
  assert.equal(pullDistance(300, 100, 0), 0);
});

test("저항 0.5 · 상한 120", () => {
  assert.equal(pullDistance(0, 100, 0), 50);
  assert.equal(pullDistance(0, 400, 0), 120);
});

test("72 이상이면 새로고침", () => {
  assert.equal(PULL_REFRESH_AT, 72);
  assert.equal(shouldRefresh(71.9), false);
  assert.equal(shouldRefresh(72), true);
});
