import { test } from "node:test";
import assert from "node:assert/strict";
import { afterRequestPurchase, EMPTY_RETURN_GRACE_MS } from "./request.ts";

const tx = { transactionId: "t1" };

test("iOS — 반환값이 비면 바로 끝내지 않고 잠깐(늦게 올 취소 알림) 기다린 뒤 pending", () => {
  const later = { kind: "pendingAfter", ms: EMPTY_RETURN_GRACE_MS };
  assert.deepEqual(afterRequestPurchase("ios", true, null), later);
  assert.deepEqual(afterRequestPurchase("ios", true, undefined), later);
  assert.deepEqual(afterRequestPurchase("ios", true, []), later);
});

test("기다리는 시간은 알림 한두 번 건너올 만큼 — 웹 버튼을 오래 막지 않게 짧게", () => {
  assert.ok(EMPTY_RETURN_GRACE_MS >= 1_000 && EMPTY_RETURN_GRACE_MS <= 2_000);
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
