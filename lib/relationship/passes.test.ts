// lib/relationship/passes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PASS_PLAN_BY_KIND } from "./types.ts";

test("패스 kind → cost/days 매핑 (RPC 인자 정본)", () => {
  assert.deepEqual(
    { c: PASS_PLAN_BY_KIND.day7.cost, d: PASS_PLAN_BY_KIND.day7.days },
    { c: 60, d: 7 }
  );
});
