import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shopFailReason, shopReturnKind } from "./shop-return.ts";

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

test("shopFailReason — '카드사 답'은 카드사 거절 코드에만 붙인다", () => {
  assert.equal(shopFailReason("REJECT_CARD_COMPANY", "한도 초과"), "카드사 답: 한도 초과");
  assert.equal(shopFailReason("REJECT_CARD_PAYMENT", "잔액 부족"), "카드사 답: 잔액 부족");
  assert.equal(shopFailReason("REJECT_ACCOUNT_PAYMENT", "계좌 잔액 부족"), "계좌 잔액 부족");
  assert.equal(shopFailReason(null, "잠시 뒤 다시"), "잠시 뒤 다시");
  assert.equal(shopFailReason("REJECT_CARD_COMPANY", null), "다시 골라서 해볼래?");
});

test("결제창을 닫아도(멈춤) 실패와 똑같이 하던 대화로 돌아가는 버튼이 있다", () => {
  const s = readFileSync("app/shop/page.tsx", "utf8");
  const at = (t: string, from = 0) => {
    const i = s.indexOf(t, from);
    assert.ok(i >= 0, t);
    return i;
  };
  const cancelAt = at('if (kind === "cancel")');
  const failAt = at('if (kind === "fail")', cancelAt);
  assert.match(s.slice(cancelAt, failAt), /\{backToChat\}/);
  assert.match(s.slice(failAt, at("return null;", failAt)), /\{backToChat\}/);
});
