import { test } from "node:test";
import assert from "node:assert/strict";
import { revisitSendOn, revisitWindow } from "./schedule.ts";

test("23:50 KST 에 고르면 KST 날짜로 센다", () => {
  assert.equal(revisitSendOn("3d", new Date("2026-11-06T14:50:00Z")), "2026-11-09"); // KST 11-06 23:50
  assert.equal(revisitSendOn("1w", new Date("2026-11-06T15:10:00Z")), "2026-11-14"); // KST 11-07 00:10
  assert.equal(revisitSendOn("2w", new Date("2026-11-06T03:00:00Z")), "2026-11-20");
});

test("보낼 창 경계", () => {
  const on = "2026-11-09";
  assert.equal(revisitWindow(on, new Date("2026-11-08T23:29:00Z")), "early"); // 08:29
  assert.equal(revisitWindow(on, new Date("2026-11-08T23:30:00Z")), "open"); // 08:30
  assert.equal(revisitWindow(on, new Date("2026-11-09T11:59:00Z")), "open"); // 20:59
  assert.equal(revisitWindow(on, new Date("2026-11-09T12:00:00Z")), "missed"); // 21:00
  assert.equal(revisitWindow(on, new Date("2026-11-10T00:00:00Z")), "missed"); // 다음 날
  assert.equal(revisitWindow(on, new Date("2026-11-07T03:00:00Z")), "early"); // 이틀 전
});
