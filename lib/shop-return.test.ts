import { test } from "node:test";
import assert from "node:assert/strict";
import { shopReturnKind } from "./shop-return.ts";

test("shopReturnKind — 결제창에서 돌아온 /shop 의 결과 종류", () => {
  assert.equal(shopReturnKind(null, null), null);
  assert.equal(shopReturnKind("success", null), "success");
  assert.equal(shopReturnKind("cancel", null), "cancel");
  assert.equal(shopReturnKind("fail", "REJECT_CARD_PAYMENT"), "fail");
  assert.equal(shopReturnKind("fail", null), "fail");
  // 사용자가 결제창을 직접 닫으면 토스는 failUrl 로 PAY_PROCESS_CANCELED 를 보낸다 — 실패가 아니라 취소로 보여 준다
  assert.equal(shopReturnKind("fail", "PAY_PROCESS_CANCELED"), "cancel");
  assert.equal(shopReturnKind("weird", null), null);
});
