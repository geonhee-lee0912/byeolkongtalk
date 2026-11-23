import { test } from "node:test";
import assert from "node:assert/strict";
import { afterRequestPurchase } from "./request.ts";

const tx = { transactionId: "t1" };

test("iOS — 반환값이 비면(구입 요청 등 승인 대기) 알림을 기다리지 않고 pending", () => {
  assert.deepEqual(afterRequestPurchase("ios", true, null), { kind: "pending" });
  assert.deepEqual(afterRequestPurchase("ios", true, undefined), { kind: "pending" });
  assert.deepEqual(afterRequestPurchase("ios", true, []), { kind: "pending" });
});

test("iOS — 반환값이 거래면 그 거래로 끝낸다", () => {
  assert.deepEqual(afterRequestPurchase("ios", true, tx), { kind: "purchase", purchase: tx });
  assert.deepEqual(afterRequestPurchase("ios", true, [tx]), { kind: "purchase", purchase: tx });
});

test("알림이 먼저 끝냈으면 그 결과를 그대로 — 반환값으로 또 끝내지 않는다", () => {
  assert.deepEqual(afterRequestPurchase("ios", false, null), { kind: "wait" });
  assert.deepEqual(afterRequestPurchase("ios", false, tx), { kind: "wait" });
});

test("안드로이드는 늘 알림을 기다린다(반환값은 결과가 아니다)", () => {
  assert.deepEqual(afterRequestPurchase("android", true, null), { kind: "wait" });
  assert.deepEqual(afterRequestPurchase("android", true, [tx]), { kind: "wait" });
});
