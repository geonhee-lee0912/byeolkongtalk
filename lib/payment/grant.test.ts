// 별 패키지 지급(lib/payment/grant.ts) — 토스 결제 승인과 앱 스토어 결제가 같은 함수로 별을 준다.
// 잠그는 것: 첫 결제 지급+첫충전 보너스 기록 · 같은 tid 재호출 멱등 · 동시 호출 경합(유니크 위반)에서 한 번만 지급 · 보너스 원장 중복 방지 · provider 기록.
// 의존성은 resolve 훅으로 ./grant.fakes.ts 로 바꿔 끼운다(lib/first-charge-bonus.test.ts 와 같은 방식). 로그인 수단 조회·해시·패키지 상수는 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as nodeModule from "node:module";
import type * as Fakes from "./grant.fakes.ts";
import type * as GrantModule from "./grant.ts";

globalThis.fetch = (async (input: unknown) => {
  throw new Error(`grant.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./grant.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/stars.ts", "/lib/logger.ts"];

type Loaded = { grant: typeof GrantModule; fakes: typeof Fakes };
let loaded: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const grant = (await import("./grant.ts")) as typeof GrantModule;
    return { grant, fakes };
  })();
  return loaded;
}

const PKG_10 = { id: "star_10", stars: 10, price: 1000, label: "10별" }; // 첫충전 보너스 round(10×0.2) = 2
const kakaoHash = createHash("sha256").update("4123456789").digest("hex");

async function setup() {
  const l = await load();
  l.fakes.reset();
  return l;
}

const input = (over: Partial<Parameters<typeof GrantModule.grantStarPackage>[0]> = {}) => ({
  userId: "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab",
  pkg: PKG_10,
  provider: "tosspayments" as const,
  tid: "tgen_aaa",
  amountWon: 1000,
  ...over,
});

test("첫 결제 — granted, 보너스 2, payments 행에 bonus_stars 2, 원장 청구", async () => {
  const { grant, fakes } = await setup();
  const r = await grant.grantStarPackage(input());
  assert.deepEqual(r, { kind: "granted", paymentId: "pay-1", stars: 10, bonusStars: 2, balance: 27 });
  assert.equal(fakes.state.payments.length, 1);
  assert.equal(fakes.state.payments[0].bonus_stars, 2);
  assert.equal(fakes.state.payments[0].stars_given, 10);
  assert.equal(fakes.state.payments[0].status, "completed");
  assert.deepEqual(fakes.state.ledger, [{ kakao_id_hash: kakaoHash, bonus_type: "first_charge" }]);
  // 결제 별은 기존 토스 경로와 같은 source("pg")·결제 id, 보너스는 first_charge_bonus
  assert.deepEqual(
    fakes.state.charges.map((c) => [c.amount, c.paymentId, c.source]),
    [
      [10, "pay-1", "pg"],
      [2, `first_bonus:${fakes.USER_ID}`, "first_charge_bonus"],
    ],
  );
  assert.deepEqual(fakes.state.logs, []);
});

test("같은 tid 재호출 — already(기존 stars_given·현재 잔액), 별 지급은 1회뿐", async () => {
  const { grant, fakes } = await setup();
  await grant.grantStarPackage(input());
  const again = await grant.grantStarPackage(input());
  assert.deepEqual(again, { kind: "already", paymentId: "pay-1", stars: 10, balance: 27, ownerUserId: fakes.USER_ID });
  assert.equal(fakes.state.payments.length, 1);
  assert.equal(fakes.state.charges.filter((c) => c.source === "pg").length, 1);
});

test("다른 회원이 같은 tid 로 재호출 — already 에 결제 주인(ownerUserId)이 실려 라우트가 막을 수 있다, 별은 주지 않는다", async () => {
  const { grant, fakes } = await setup();
  await grant.grantStarPackage(input());
  const other = await grant.grantStarPackage(input({ userId: "someone-else" }));
  assert.equal(other.kind, "already");
  assert.equal(other.kind === "already" && other.ownerUserId, fakes.USER_ID);
  assert.equal(fakes.state.charges.filter((c) => c.source === "pg").length, 1);
});

test("동시 두 호출 — 두 번째 INSERT 가 유니크 위반(23505)이어도 granted 1 + already 1, 별은 한 번만", async () => {
  const { grant, fakes } = await setup();
  const [a, b] = await Promise.all([grant.grantStarPackage(input()), grant.grantStarPackage(input())]);
  assert.equal(fakes.state.conflicts, 1, "경합 경로를 실제로 탔어야 한다");
  const kinds = [a.kind, b.kind].sort();
  assert.deepEqual(kinds, ["already", "granted"]);
  assert.equal(fakes.state.payments.length, 1);
  assert.equal(fakes.state.charges.filter((c) => c.source === "pg").length, 1);
  assert.equal(fakes.state.charges.filter((c) => c.source === "first_charge_bonus").length, 1);
  const already = [a, b].find((r) => r.kind === "already");
  assert.equal(already?.kind === "already" && already.stars, 10);
});

test("보너스 원장에 이미 있으면 bonusStars 0 — 지급도 payments.bonus_stars 갱신도 없다", async () => {
  const { grant, fakes } = await setup();
  fakes.state.ledger = [{ kakao_id_hash: kakaoHash, bonus_type: "first_charge" }];
  const r = await grant.grantStarPackage(input());
  assert.deepEqual(r, { kind: "granted", paymentId: "pay-1", stars: 10, bonusStars: 0, balance: 25 });
  assert.equal(fakes.state.payments[0].bonus_stars, 0);
  assert.deepEqual(fakes.state.charges.map((c) => c.source), ["pg"]);
});

test("provider 가 apple 이면 pg_provider 'apple' 로 INSERT", async () => {
  const { grant, fakes } = await setup();
  const r = await grant.grantStarPackage(input({ provider: "apple", tid: "apple_txn_1" }));
  assert.equal(r.kind, "granted");
  assert.equal(fakes.state.payments[0].pg_provider, "apple");
  assert.equal(fakes.state.payments[0].pg_tid, "apple_txn_1");
  assert.equal(fakes.state.payments[0].amount_won, 1000);
});

test("유니크 위반이 아닌 INSERT 실패 — insert_failed(오류 그대로), 별은 주지 않는다", async () => {
  const { grant, fakes } = await setup();
  fakes.state.insertError = { message: "boom", code: "XX000" };
  const r = await grant.grantStarPackage(input());
  assert.equal(r.kind, "insert_failed");
  assert.deepEqual(r.kind === "insert_failed" && (r.error as { code: string }).code, "XX000");
  assert.deepEqual(fakes.state.charges, []);
});

test("결제 별 충전 실패 — charge_failed + CRITICAL_PAYMENT_RECONCILE 로그, 보너스는 시도하지 않는다", async () => {
  const { grant, fakes } = await setup();
  fakes.state.failSources = ["pg"];
  const r = await grant.grantStarPackage(input());
  assert.deepEqual(r, { kind: "charge_failed", paymentId: "pay-1" });
  assert.deepEqual(fakes.state.charges.map((c) => c.source), ["pg"]);
  assert.deepEqual(fakes.state.ledger, []);
  assert.ok(fakes.state.logs.some((l) => l.level === "error" && l.extra.severity === "CRITICAL_PAYMENT_RECONCILE"));
});

test("bonus_stars 갱신이 실패해도 별은 이미 줬으니 granted 를 돌려주고 로그만 남긴다", async () => {
  const { grant, fakes } = await setup();
  fakes.state.updateError = { message: "boom", code: "XX000" };
  const r = await grant.grantStarPackage(input());
  assert.deepEqual(r, { kind: "granted", paymentId: "pay-1", stars: 10, bonusStars: 2, balance: 27 });
  assert.ok(fakes.state.logs.some((l) => l.extra.severity === "PAYMENT_BONUS_STARS_RECORD_FAILED"));
});
