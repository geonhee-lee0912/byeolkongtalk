// 앱 결제 환불 → 별 회수(lib/payment/iap/refund.ts)와 환불 알림 라우트 2개(애플·구글)를 잠근다 — 스펙 2026-11-23-앱-결제 §4.
// ① 회수량 = 그 결제로 준 별 + 첫충전 보너스, 잔액이 모자라면 0 까지만 거두고 모자란 양을 결제 행에 남긴다(warn 도)
// ② 같은 환불이 두 번 와도 한 번만 — 이미 refunded 면 already, 회수 함수도 'clawback:<결제 id>' 로 멱등
// ③ 라우트 상태 코드: 처리·모름·이미·무시 = 2xx / 서명·인증 실패 = 401 / 처리 실패(DB·회수) = 500(스토어가 다시 보낸다) / 설정 없음 = 503
// 의존성은 resolve 훅으로 ./iap-refund.fakes.ts 로 바꿔 끼운다. 회수 함수·RTDN 해석·설정 확인은 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./iap-refund.fakes.ts";
import type * as RefundModule from "./iap/refund.ts";

// 이 경로엔 실제 네트워크가 없어야 한다(스토어·DB 는 전부 가짜)
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`iap-refund.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

process.env.APPLE_APP_ID = "1234567890";
process.env.GOOGLE_PUBSUB_PUSH_EMAIL = "pubsub-push@test-project.iam.gserviceaccount.com";
process.env.GOOGLE_PUBSUB_AUDIENCE = "https://dev.example.test/api/payment/iap/google/notify";

// registerHooks 는 Node 22.15·23.5+ 에 있는데 설치된 @types/node(20) 엔 아직 타입이 없다 — 쓰는 모양만 선언한다.
type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./iap-refund.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/stars.ts", "/lib/logger.ts", "/lib/payment/iap/apple.ts", "/lib/payment/iap/google.ts"];

type Handler = (request: NextRequest) => Promise<Response>;
type Loaded = { refund: typeof RefundModule; apple: Handler; google: Handler; fakes: typeof Fakes };
let loaded: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    // 가짜 상태는 회수 함수·라우트가 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const refund = (await import("./iap/refund.ts")) as typeof RefundModule;
    const { POST: apple } = await import("@/app/api/payment/iap/apple/notify/route");
    const { POST: google } = await import("@/app/api/payment/iap/google/notify/route");
    return { refund, apple, google, fakes };
  })();
  return loaded;
}

async function setup() {
  const l = await load();
  l.fakes.reset();
  return l;
}

const APPLE_TID = "apple:2000000000000001";
const ORDER_ID = "GPA.0000-0000-0000-00001";

/** 환경 변수를 잠깐 지우고 fn 을 돌린 뒤 되돌린다 */
async function without<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const saved = process.env[name];
  delete process.env[name];
  try {
    return await fn();
  } finally {
    process.env[name] = saved;
  }
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ━━ refundIapPayment ━━

test("① 첫 환불 → clawed — 결제 별+보너스(12)를 'clawback:<결제 id>' 로 거두고 payments 에 refunded·시각·회수량·부족 0", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment();
  const r = await refund.refundIapPayment(APPLE_TID);
  assert.deepEqual(r, { kind: "clawed", clawed: 12, shortfall: 0 });
  assert.deepEqual(fakes.state.clawbacks, [{ userId: fakes.USER_ID, amount: 12, paymentId: "clawback:pay-1" }]);
  assert.equal(fakes.state.balance, 8);
  const p = fakes.state.payments[0];
  assert.equal(p.status, "refunded");
  assert.ok(typeof p.refunded_at === "string" && !Number.isNaN(Date.parse(p.refunded_at)));
  assert.equal(p.stars_clawed_back, 12);
  assert.equal(p.clawback_shortfall, 0);
  assert.equal(fakes.state.logs.length, 0); // 부족 없으면 경고도 없다
});

test("② 같은 tid 두 번째 → already, 회수 함수는 한 번만", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment();
  await refund.refundIapPayment(APPLE_TID);
  assert.deepEqual(await refund.refundIapPayment(APPLE_TID), { kind: "already" });
  assert.equal(fakes.state.clawbacks.length, 1);
  assert.equal(fakes.state.updates.length, 1);
});

test("③ 잔액 3 · 회수 12 → clawed 3, shortfall 9 기록 + 'iap refund shortfall' warn(결제 id 만, 회원 id 없이)", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment();
  fakes.state.balance = 3;
  assert.deepEqual(await refund.refundIapPayment(APPLE_TID), { kind: "clawed", clawed: 3, shortfall: 9 });
  assert.equal(fakes.state.balance, 0);
  assert.equal(fakes.state.payments[0].stars_clawed_back, 3);
  assert.equal(fakes.state.payments[0].clawback_shortfall, 9);
  const warns = fakes.state.logs.filter((l) => l.level === "warn");
  assert.equal(warns.length, 1);
  assert.equal(warns[0].message, "iap refund shortfall");
  assert.deepEqual(warns[0].extra, { paymentId: "pay-1", clawed: 3, shortfall: 9 });
  assert.ok(!warns[0].userId, "로그에 회원 id 를 싣지 않는다");
  assert.ok(!JSON.stringify(fakes.state.logs).includes(fakes.USER_ID));
});

test("④ 모르는 tid → not_found, 회수·갱신 없음", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment();
  assert.deepEqual(await refund.refundIapPayment("apple:9999"), { kind: "not_found" });
  assert.equal(fakes.state.clawbacks.length, 0);
  assert.equal(fakes.state.updates.length, 0);
});

test("탈퇴로 user_id NULL → 회수 없이 refunded·시각만, 회수 0 · 부족 NULL", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment({ user_id: null });
  assert.deepEqual(await refund.refundIapPayment(APPLE_TID), { kind: "clawed", clawed: 0, shortfall: 0 });
  assert.equal(fakes.state.clawbacks.length, 0);
  const p = fakes.state.payments[0];
  assert.equal(p.status, "refunded");
  assert.ok(p.refunded_at);
  assert.equal(p.stars_clawed_back, 0);
  assert.equal(p.clawback_shortfall, null);
});

test("결제 별 충전이 실패했던 결제(charge_failed — 충전 거래 없음)·보너스 0 → 회수 함수를 부르지 않고 refunded·회수 0·부족 0", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment({ bonus_stars: 0 }, { charged: false });
  assert.deepEqual(await refund.refundIapPayment(APPLE_TID), { kind: "clawed", clawed: 0, shortfall: 0 });
  assert.equal(fakes.state.clawbacks.length, 0, "주지 않은 별을 다른 별에서 거두면 안 된다");
  assert.equal(fakes.state.balance, 20);
  const p = fakes.state.payments[0];
  assert.equal(p.status, "refunded");
  assert.ok(p.refunded_at);
  assert.equal(p.stars_clawed_back, 0);
  assert.equal(p.clawback_shortfall, 0);
  assert.equal(fakes.state.logs.length, 0);
});

test("충전 거래가 있으면 결제 별+보너스(12)를 그대로 거둔다", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment({}, { charged: true });
  assert.deepEqual(await refund.refundIapPayment(APPLE_TID), { kind: "clawed", clawed: 12, shortfall: 0 });
  assert.deepEqual(fakes.state.clawbacks, [{ userId: fakes.USER_ID, amount: 12, paymentId: "clawback:pay-1" }]);
});

test("회수 실패(success:false) → 던진다, refunded 로 바꾸지 않는다(다음 재전송이 다시 시도)", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment();
  fakes.state.clawbackFails = true;
  await assert.rejects(refund.refundIapPayment(APPLE_TID), /clawback/);
  assert.equal(fakes.state.payments[0].status, "completed");
  assert.equal(fakes.state.updates.length, 0);
});

test("앞 시도가 거두고 갱신 전에 죽음(회수 멱등) — 회수량이 비었으면 멱등 결과로 채우고 refunded", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment();
  fakes.state.clawed.set("clawback:pay-1", 5); // 앞 시도: 잔액 5 만 거둠
  assert.deepEqual(await refund.refundIapPayment(APPLE_TID), { kind: "clawed", clawed: 5, shortfall: 7 });
  const p = fakes.state.payments[0];
  assert.equal(p.status, "refunded");
  assert.equal(p.stars_clawed_back, 5);
  assert.equal(p.clawback_shortfall, 7);
  assert.equal(fakes.state.balance, 20, "다시 거두지 않는다");
});

test("회수 멱등인데 회수량이 이미 있으면 덮어쓰지 않는다 — 상태·시각만", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment({ stars_clawed_back: 7, clawback_shortfall: 5 });
  fakes.state.clawed.set("clawback:pay-1", 12);
  await refund.refundIapPayment(APPLE_TID);
  const p = fakes.state.payments[0];
  assert.equal(p.status, "refunded");
  assert.equal(p.stars_clawed_back, 7);
  assert.equal(p.clawback_shortfall, 5);
  assert.ok(!("stars_clawed_back" in fakes.state.updates[0]) && !("clawback_shortfall" in fakes.state.updates[0]));
});

test("결제 조회·갱신 DB 오류 → 던진다", async () => {
  const { refund, fakes } = await setup();
  fakes.seedPayment();
  fakes.state.lookupError = { message: "connection reset" };
  await assert.rejects(refund.refundIapPayment(APPLE_TID), /connection reset/);
  fakes.state.lookupError = null;
  fakes.state.updateError = { message: "update timeout" };
  await assert.rejects(refund.refundIapPayment(APPLE_TID), /update timeout/);
});

// ━━ 애플 라우트 POST /api/payment/iap/apple/notify ━━

const URL_APPLE = "http://localhost:3000/api/payment/iap/apple/notify";
const appleReq = (body: unknown, raw?: string) =>
  new NextRequest(URL_APPLE, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });

test("애플 REFUND → 200, 그 결제를 회수", async () => {
  const { apple, fakes } = await setup();
  fakes.seedPayment();
  fakes.state.apple = { kind: "refund", tid: APPLE_TID };
  const res = await apple(appleReq({ signedPayload: "signed-notification" }));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.appleCalls, ["signed-notification"]);
  assert.equal(fakes.state.payments[0].status, "refunded");
  assert.equal(fakes.state.clawbacks.length, 1);
});

test("⑤ 애플 서명 검증 실패 → 401 + warn, 결제를 찾지 않는다", async () => {
  const { apple, fakes } = await setup();
  fakes.state.apple = { kind: "invalid", reason: "VERIFICATION_FAILURE" };
  const res = await apple(appleReq({ signedPayload: "forged" }));
  assert.equal(res.status, 401);
  assert.equal(fakes.state.lookups.length, 0);
  assert.deepEqual(
    fakes.state.logs.map((l) => [l.level, l.extra.reason]),
    [["warn", "VERIFICATION_FAILURE"]],
  );
});

test("⑥ 애플 REFUND_REVERSED → 200 무시, 결제를 찾지 않는다", async () => {
  const { apple, fakes } = await setup();
  fakes.seedPayment();
  fakes.state.apple = { kind: "ignored", notificationType: "REFUND_REVERSED" };
  const res = await apple(appleReq({ signedPayload: "signed-notification" }));
  assert.equal(res.status, 200);
  assert.equal(fakes.state.lookups.length, 0);
  assert.equal(fakes.state.payments[0].status, "completed");
});

test("애플 — 모르는 결제 → 200(다시 보내도 소용없다)", async () => {
  const { apple, fakes } = await setup();
  fakes.state.apple = { kind: "refund", tid: "apple-sandbox:777" };
  const res = await apple(appleReq({ signedPayload: "signed-notification" }));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.lookups, ["apple-sandbox:777"]);
});

test("애플 — 이미 환불 처리됨 → 200", async () => {
  const { apple, fakes } = await setup();
  fakes.seedPayment({ status: "refunded" });
  fakes.state.apple = { kind: "refund", tid: APPLE_TID };
  assert.equal((await apple(appleReq({ signedPayload: "signed-notification" }))).status, 200);
  assert.equal(fakes.state.clawbacks.length, 0);
});

test("애플 — 본문이 JSON 아님·signedPayload 없음·문자열 아님 → 400, 검증기도 안 부르고 로그도 없다", async () => {
  const { apple, fakes } = await setup();
  for (const req of [appleReq(null, "not json"), appleReq({}), appleReq({ signedPayload: 42 }), appleReq({ signedPayload: "" }), appleReq([1])]) {
    assert.equal((await apple(req)).status, 400);
  }
  assert.equal(fakes.state.appleCalls.length, 0);
  assert.equal(fakes.state.logs.length, 0);
});

test("애플 — 너무 큰 본문 → 400", async () => {
  const { apple, fakes } = await setup();
  const res = await apple(appleReq({ signedPayload: "x".repeat(300_000) }));
  assert.equal(res.status, 400);
  assert.equal(fakes.state.appleCalls.length, 0);
});

test("애플 — 검증 중 오류(인증서 폐기 확인 실패 등) → 500 + logError", async () => {
  const { apple, fakes } = await setup();
  fakes.state.apple = new Error("apple JWS verification failed status 2 RETRYABLE_VERIFICATION_FAILURE");
  const res = await apple(appleReq({ signedPayload: "signed-notification" }));
  assert.equal(res.status, 500);
  assert.deepEqual(
    fakes.state.logs.map((l) => l.level),
    ["error"],
  );
});

test("애플 — 회수 실패 → 500 + logError, refunded 로 안 바뀜", async () => {
  const { apple, fakes } = await setup();
  fakes.seedPayment();
  fakes.state.clawbackFails = true;
  fakes.state.apple = { kind: "refund", tid: APPLE_TID };
  const res = await apple(appleReq({ signedPayload: "signed-notification" }));
  assert.equal(res.status, 500);
  assert.equal(fakes.state.payments[0].status, "completed");
  assert.ok(fakes.state.logs.some((l) => l.level === "error"));
});

test("애플 — APPLE_APP_ID 없음 → 503, 검증기를 부르지 않는다", async () => {
  const { apple, fakes } = await setup();
  const res = await without("APPLE_APP_ID", () => apple(appleReq({ signedPayload: "signed-notification" })));
  assert.equal(res.status, 503);
  assert.equal(fakes.state.appleCalls.length, 0);
});

// ━━ 구글 라우트 POST /api/payment/iap/google/notify ━━

const URL_GOOGLE = "http://localhost:3000/api/payment/iap/google/notify";
const rtdn = (note: Record<string, unknown>) => ({
  message: { data: Buffer.from(JSON.stringify({ version: "1.0", packageName: "com.byeolkongtalk.app", ...note })).toString("base64"), messageId: "1" },
  subscription: "projects/p/subscriptions/s",
});
const voided = (orderId = ORDER_ID) => rtdn({ voidedPurchaseNotification: { purchaseToken: "tok", orderId, productType: 2, refundType: 1 } });
const googleReq = (body: unknown, auth: string | null = "Bearer push-jwt") =>
  new NextRequest(URL_GOOGLE, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth === null ? {} : { authorization: auth }) },
    body: JSON.stringify(body),
  });

test("⑦ 구글 푸시 인증 실패(다른 이메일 등) → 401, 결제를 찾지 않는다", async () => {
  const { google, fakes } = await setup();
  fakes.state.googleAuth = false;
  const res = await google(googleReq(voided(), "Bearer someone-elses-jwt"));
  assert.equal(res.status, 401);
  assert.deepEqual(fakes.state.googleAuthCalls, ["Bearer someone-elses-jwt"]);
  assert.equal(fakes.state.lookups.length, 0);
});

test("⑧ 구글 정상 → refundIapPayment('google:GPA.…') — 200, 회수", async () => {
  const { google, fakes } = await setup();
  fakes.seedPayment({ pg_provider: "google", pg_tid: `google:${ORDER_ID}` });
  const res = await google(googleReq(voided()));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.lookups, [`google:${ORDER_ID}`]);
  assert.equal(fakes.state.payments[0].status, "refunded");
  assert.equal(fakes.state.clawbacks.length, 1);
});

test("구글 — 테스트 결제(google-test:)도 찾아본다", async () => {
  const { google, fakes } = await setup();
  fakes.seedPayment({ pg_provider: "google", pg_tid: `google-test:${ORDER_ID}` });
  const res = await google(googleReq(voided()));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.lookups, [`google:${ORDER_ID}`, `google-test:${ORDER_ID}`]);
  assert.equal(fakes.state.payments[0].status, "refunded");
});

test("구글 — 모르는 주문 → 200", async () => {
  const { google, fakes } = await setup();
  const res = await google(googleReq(voided("GPA.9999")));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.lookups, ["google:GPA.9999", "google-test:GPA.9999"]);
});

test("구글 — 시험 알림·다른 알림·모양이 틀린 본문(인증은 통과) → 200 무시, 결제를 찾지 않는다", async () => {
  const { google, fakes } = await setup();
  for (const body of [rtdn({ testNotification: { version: "1.0" } }), rtdn({ oneTimeProductNotification: {} }), { message: {} }]) {
    assert.equal((await google(googleReq(body))).status, 200, JSON.stringify(body));
  }
  assert.equal(fakes.state.lookups.length, 0);
});

test("구글 — 회수 실패 → 500 + logError(Pub/Sub 이 다시 보낸다)", async () => {
  const { google, fakes } = await setup();
  fakes.seedPayment({ pg_provider: "google", pg_tid: `google:${ORDER_ID}` });
  fakes.state.clawbackFails = true;
  const res = await google(googleReq(voided()));
  assert.equal(res.status, 500);
  assert.ok(fakes.state.logs.some((l) => l.level === "error"));
  assert.equal(fakes.state.payments[0].status, "completed");
});

test("구글 — 설정(GOOGLE_PUBSUB_PUSH_EMAIL·AUDIENCE) 없음 → 503, 인증도 안 부른다", async () => {
  const { google, fakes } = await setup();
  for (const name of ["GOOGLE_PUBSUB_PUSH_EMAIL", "GOOGLE_PUBSUB_AUDIENCE"]) {
    const res = await without(name, () => google(googleReq(voided())));
    assert.equal(res.status, 503, name);
  }
  assert.equal(fakes.state.googleAuthCalls.length, 0);
});

test("응답 본문에 결과 종류(clawed·already·not_found·ignored)", async () => {
  const { google, fakes } = await setup();
  fakes.seedPayment({ pg_provider: "google", pg_tid: `google:${ORDER_ID}` });
  assert.equal((await json(await google(googleReq(voided())))).result, "clawed");
  assert.equal((await json(await google(googleReq(voided())))).result, "already");
  assert.equal((await json(await google(googleReq(voided("GPA.1"))))).result, "not_found");
  assert.equal((await json(await google(googleReq(rtdn({ testNotification: {} }))))).result, "ignored");
});
