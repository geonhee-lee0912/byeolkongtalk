// clawbackStars(lib/stars.ts) — clawback_stars RPC 래퍼. 응답 필드 이름 매핑(balance_after → balance)과
// RPC 오류·success:false 에서 throw 하지 않고 success:false 를 돌려주는 것을 잠근다. chargeStars 와 같은 모양.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import type * as StarsModule from "./stars.ts";
import type * as Fakes from "./stars-clawback.fakes.ts";

type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./stars-clawback.fakes.ts", import.meta.url).href;

type Loaded = { stars: typeof StarsModule; fakes: typeof Fakes };
let loaded: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return r.url.endsWith("/lib/supabase.ts") ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    return { stars: (await import("./stars.ts")) as typeof StarsModule, fakes };
  })();
  return loaded;
}

test("clawbackStars — RPC 응답을 balance 로 옮기고 인자를 그대로 넘긴다(접두는 호출자 몫)", async () => {
  const { stars: { clawbackStars }, fakes: { calls, next } } = await load();
  calls.length = 0;
  next.value = { data: { success: true, clawed: 7, shortfall: 3, balance_after: 0, idempotent: false }, error: null };
  const r = await clawbackStars("u1", 10, "clawback:pay-1");
  assert.deepEqual(r, { success: true, clawed: 7, shortfall: 3, balance: 0, idempotent: false });
  assert.deepEqual(calls, [
    { fn: "clawback_stars", args: { p_user_id: "u1", p_amount: 10, p_payment_id: "clawback:pay-1" } },
  ]);
});

test("clawbackStars — 같은 환불 재호출(idempotent)은 그대로 전달", async () => {
  const { stars: { clawbackStars }, fakes: { next } } = await load();
  next.value = { data: { success: true, clawed: 10, shortfall: 0, balance_after: 5, idempotent: true }, error: null };
  assert.deepEqual(await clawbackStars("u1", 10, "clawback:pay-1"), {
    success: true,
    clawed: 10,
    shortfall: 0,
    balance: 5,
    idempotent: true,
  });
});

test("clawbackStars — RPC 오류·success:false 는 throw 없이 success:false", async () => {
  const { stars: { clawbackStars }, fakes: { next } } = await load();
  const orig = console.error;
  console.error = () => {};
  try {
    next.value = { data: null, error: { message: "boom" } };
    assert.deepEqual(await clawbackStars("u1", 10, "clawback:pay-1"), {
      success: false,
      clawed: 0,
      shortfall: 0,
      balance: 0,
      idempotent: false,
    });
    next.value = { data: { success: false, reason: "invalid_payment_id" }, error: null };
    const r = await clawbackStars("u1", 10, "pay-1");
    assert.equal(r.success, false);
    assert.equal(r.clawed, 0);
  } finally {
    console.error = orig;
  }
});
