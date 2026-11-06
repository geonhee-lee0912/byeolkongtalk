import { test } from "node:test";
import assert from "node:assert/strict";
import { pathFromNotificationData, toPushState } from "./state.ts";

test("권한 상태 매핑", () => {
  assert.equal(toPushState({ status: "granted", canAskAgain: true }), "granted");
  assert.equal(toPushState({ status: "denied", canAskAgain: false }), "denied");
  assert.equal(toPushState({ status: "denied", canAskAgain: true }), "undetermined"); // 안드로이드 첫 거부
  assert.equal(toPushState({ status: "undetermined", canAskAgain: true }), "undetermined");
});

test("알림 data 의 경로만 연다", () => {
  assert.equal(pathFromNotificationData({ path: "/tarot/result?id=r1" }), "/tarot/result?id=r1");
  assert.equal(pathFromNotificationData({ path: "//evil.com" }), null);
  assert.equal(pathFromNotificationData({ path: "https://evil.com" }), null);
  assert.equal(pathFromNotificationData(null), null);
  assert.equal(pathFromNotificationData({ path: 1 }), null);
  assert.equal(pathFromNotificationData("/a"), null);
  // 딥링크와 같은 검사 — 퍼센트 인코딩 점 조각(/%2e%2e//x → //x)도 막는다
  assert.equal(pathFromNotificationData({ path: "/%2e%2e//evil.com" }), null);
});
