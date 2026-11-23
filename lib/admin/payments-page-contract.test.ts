// 소스 계약 — 스토어 결제는 토스 환불 버튼을 달지 않는다(토스로는 환불할 수 없다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("RefundButton 은 pg_provider === 'tosspayments' 줄에서만 렌더된다", () => {
  const src = readFileSync("app/admin/payments/page.tsx", "utf8");
  const i = src.indexOf("<RefundButton");
  assert.ok(i > 0);
  const before = src.slice(Math.max(0, i - 200), i);
  assert.match(before, /pg_provider === "tosspayments"/);
});
