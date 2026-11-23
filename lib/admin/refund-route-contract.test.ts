// 소스 계약 — 어드민 토스 환불 라우트는 토스 결제가 아니면 cancelPayment 전에 409 로 막는다.
// (라우트 실행 테스트는 requireAdminWrite·supabase·toss 가짜가 줄줄이 필요해 소스 계약으로 잠근다)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("환불 라우트: pg_provider 를 읽고, 토스가 아니면 cancelPayment 전에 409 not_refundable", () => {
  const src = readFileSync("app/api/admin/payments/[id]/refund/route.ts", "utf8");
  assert.match(src, /select\("id, pg_tid, pg_provider, status"\)/);
  const guard = src.search(/pg_provider !== "tosspayments"[\s\S]{0,120}not_refundable[\s\S]{0,40}409/);
  const call = src.indexOf("await cancelPayment(");
  assert.ok(guard > 0 && call > 0 && guard < call);
});
