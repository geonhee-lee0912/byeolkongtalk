import { test } from "node:test";
import assert from "node:assert/strict";
import { pathFromNotificationData, pathFromNotificationResponse, toPushState, UNSUBSCRIBE_ACTION } from "./state.ts";

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

test("알림 누름 — 본문은 data.path, [수신거부] 버튼은 수신거부 화면", () => {
  const unsub = "v1.42." + "A".repeat(22);
  assert.equal(pathFromNotificationResponse("default", "default", { path: "/", unsub }), "/");
  assert.equal(pathFromNotificationResponse(UNSUBSCRIBE_ACTION, "default", { path: "/", unsub }), `/push/unsubscribe#t=${unsub}`);
  assert.equal(pathFromNotificationResponse(UNSUBSCRIBE_ACTION, "default", { path: "/" }), null);
  assert.equal(pathFromNotificationResponse(UNSUBSCRIBE_ACTION, "default", { unsub: "v1.42.x/../evil" }), null);
  assert.equal(pathFromNotificationResponse("other", "default", { path: "/", unsub }), null);
  // 우리 경로 검사(딥링크와 같은 규칙)를 통과한다
  assert.equal(pathFromNotificationData({ path: `/push/unsubscribe#t=${unsub}` }), `/push/unsubscribe#t=${unsub}`);
});
