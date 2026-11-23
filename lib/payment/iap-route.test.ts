// 앱 결제 확인 라우트(app/api/payment/iap/route.ts)의 겉 동작을 잠근다 — 스펙 2026-11-23-앱-결제 §3.
// ① 앱이 보낸 건 거래 식별자뿐 — 서버가 스토어에 물어 본 결과(상품·계정 토큰·상태)로만 지급한다
// ② 지급하지 않는 실패마다 상태 코드가 정해져 있다(앱은 ok·revoked 일 때만 거래를 마무리한다 — Task 7). 다른 회원의 거래는 409 로 막고 마무리도 안 시킨다
// ③ 샌드박스(앱 심사자 구매)는 별은 주되 매출 0원, 결제 고유 번호 접두로 갈린다
// 의존성은 resolve 훅으로 ./iap-route.fakes.ts 로 바꿔 끼운다. 계정 토큰·설정 확인·본문 읽기·속도 제한·패키지 상수는 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import { STAR_PACKAGES } from "../constants.ts";
import { iapAccountToken } from "./iap/account-token.ts";
import type { VerifiedPurchase } from "./iap/verify.ts";
import type * as Fakes from "./iap-route.fakes.ts";

// 이 라우트 경로엔 실제 네트워크가 없어야 한다(스토어·DB 는 전부 가짜) — 새 import 가 실서버로 새면 여기서 바로 드러난다
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`iap-route.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const APPLE_ENV = {
  APPLE_IAP_KEY_ID: "TESTKEYID1",
  APPLE_IAP_ISSUER_ID: "test-issuer",
  APPLE_IAP_PRIVATE_KEY: "test-private-key",
  APPLE_APP_ID: "1234567890",
};
Object.assign(process.env, APPLE_ENV);
process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = JSON.stringify({ client_email: "sa@test.invalid", private_key: "test" });
process.env.APP_ACCESS_TOKEN_SECRET = randomBytes(48).toString("base64");

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

const FAKES_URL = new URL("./iap-route.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = [
  "/lib/session.ts",
  "/lib/logger.ts",
  "/lib/payment/iap/apple.ts",
  "/lib/payment/iap/google.ts",
  "/lib/payment/grant.ts",
];

type Handler = (request: NextRequest) => Promise<Response>;
type Routes = { GET: Handler; POST: Handler; fakes: typeof Fakes };
let loaded: Promise<Routes> | null = null;
function load(): Promise<Routes> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    // 가짜 상태는 라우트가 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { GET, POST } = await import("@/app/api/payment/iap/route");
    return { GET, POST, fakes };
  })();
  return loaded;
}

async function setup() {
  const l = await load();
  l.fakes.reset();
  return l;
}

// 속도 제한(IP 당 분당 20회, 인스턴스 메모리)은 진짜다 — 테스트끼리 버킷이 섞이지 않게 요청마다 새 IP
let ipSeq = 0;
const nextIp = () => {
  ipSeq++;
  return `10.31.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
};
const URL_IAP = "http://localhost:3000/api/payment/iap";
function post(body: unknown, opts: { raw?: string } = {}): NextRequest {
  return new NextRequest(URL_IAP, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": nextIp() },
    body: opts.raw ?? JSON.stringify(body),
  });
}
const get = () => new NextRequest(URL_IAP, { method: "GET", headers: { "x-forwarded-for": nextIp() } });

const TXN = "2000000000000001";
const PURCHASE_TOKEN = "fake-purchase-token-do-not-log";
const ORDER_ID = "GPA.0000-0000-0000-00001";
const PKG = STAR_PACKAGES.find((p) => p.id === "star_10")!;
const iosBody = (over: Record<string, unknown> = {}) => ({ platform: "ios", productId: "star_10", transactionId: TXN, ...over });
const androidBody = (over: Record<string, unknown> = {}) => ({
  platform: "android",
  productId: "star_10",
  purchaseToken: PURCHASE_TOKEN,
  ...over,
});

const mine = () => iapAccountToken("11111111-1111-4111-8111-111111111111");
const applePurchase = (over: Partial<VerifiedPurchase> = {}): VerifiedPurchase => ({
  store: "apple",
  productId: "star_10",
  tid: `apple:${TXN}`,
  sandbox: false,
  accountToken: mine(),
  revoked: false,
  pending: false,
  ...over,
});
const googlePurchase = (over: Partial<VerifiedPurchase> = {}): VerifiedPurchase => ({
  store: "google",
  productId: "star_10",
  tid: `google:${ORDER_ID}`,
  sandbox: false,
  accountToken: mine(),
  revoked: false,
  pending: false,
  ...over,
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** 환경 변수를 잠깐 바꿔(undefined = 지움) fn 을 돌리고 되돌린다 */
async function withEnv<T>(name: string, value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

// ───────────────────────── 들어오기 전 ─────────────────────────

test("비로그인 — 401 unauthenticated, 스토어·지급 호출 0", async () => {
  const { POST, fakes } = await setup();
  fakes.state.sessionUserId = null;
  for (const body of [iosBody(), androidBody()]) {
    const res = await POST(post(body));
    assert.equal(res.status, 401);
    assert.deepEqual(await json(res), { error: "unauthenticated" });
  }
  assert.deepEqual(fakes.state.appleCalls, []);
  assert.deepEqual(fakes.state.googleCalls, []);
  assert.deepEqual(fakes.state.grantCalls, []);
});

test("본문이 틀리면 400 bad_request — JSON 아님 · 플랫폼 모름 · ios 인데 거래 id 없음 · android 인데 구매 토큰 없음", async () => {
  const { POST, fakes } = await setup();
  const cases = [
    post(null, { raw: "{not json" }),
    post(iosBody({ platform: "web" })),
    post(iosBody({ transactionId: undefined })),
    post(iosBody({ transactionId: 12345 })),
    post(androidBody({ purchaseToken: "" })),
    post(iosBody({ productId: undefined })),
  ];
  for (const req of cases) {
    const res = await POST(req);
    assert.equal(res.status, 400);
    assert.deepEqual(await json(res), { error: "bad_request" });
  }
  assert.deepEqual(fakes.state.appleCalls, []);
  assert.deepEqual(fakes.state.googleCalls, []);
});

test("모르는 상품 id — 400 unknown_product, 스토어에 묻지 않는다", async () => {
  const { POST, fakes } = await setup();
  const res = await POST(post(iosBody({ productId: "star_9999" })));
  assert.equal(res.status, 400);
  assert.deepEqual(await json(res), { error: "unknown_product" });
  assert.deepEqual(fakes.state.appleCalls, []);
});

test("설정 없음 — 그 플랫폼만 503 iap_not_configured(error 로그), 다른 플랫폼은 돈다", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase();
  fakes.state.google = googlePurchase();
  for (const name of Object.keys(APPLE_ENV)) {
    await withEnv(name, undefined, async () => {
      const ios = await POST(post(iosBody()));
      assert.equal(ios.status, 503, name);
      assert.deepEqual(await json(ios), { error: "iap_not_configured" });
      const android = await POST(post(androidBody()));
      assert.equal(android.status, 200, `${name} 가 없어도 안드로이드는 돈다`);
    });
  }
  await withEnv("GOOGLE_PLAY_SERVICE_ACCOUNT", undefined, async () => {
    const android = await POST(post(androidBody()));
    assert.equal(android.status, 503);
    assert.deepEqual(await json(android), { error: "iap_not_configured" });
    const ios = await POST(post(iosBody()));
    assert.equal(ios.status, 200);
  });
  await withEnv("APP_ACCESS_TOKEN_SECRET", undefined, async () => {
    const ios = await POST(post(iosBody()));
    assert.equal(ios.status, 503, "계정 토큰을 못 만들면 대조도 못 한다");
  });
  assert.equal(fakes.state.appleCalls.length, 1);
  assert.equal(fakes.state.googleCalls.length, Object.keys(APPLE_ENV).length);
  assert.ok(fakes.state.logs.some((l) => l.level === "error" && l.extra.platform === "ios"));
  assert.ok(fakes.state.logs.some((l) => l.level === "error" && l.extra.platform === "android"));
});

// ───────────────────────── 스토어 결과 ─────────────────────────

test("정상 애플 — 200 + 앱이 읽는 응답(캐시 금지), 지급은 apple · apple:<거래 id> · 패키지 정가", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase();
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await json(res), { ok: true, stars: 10, bonusStars: 2, balance: 27, already: false });
  assert.deepEqual(fakes.state.appleCalls, [TXN]);
  assert.deepEqual(fakes.state.grantCalls, [
    { userId: fakes.USER_ID, pkg: PKG, provider: "apple", tid: `apple:${TXN}`, amountWon: PKG.price },
  ]);
  assert.deepEqual(fakes.state.logs, []);
});

test("애플 샌드박스(심사자 구매) — 별은 주되 amountWon 0, tid 는 apple-sandbox:", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase({ sandbox: true, tid: `apple-sandbox:${TXN}` });
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 200);
  assert.equal(fakes.state.grantCalls.length, 1);
  assert.equal(fakes.state.grantCalls[0].amountWon, 0);
  assert.ok(fakes.state.grantCalls[0].tid.startsWith("apple-sandbox:"));
});

test("정상 구글 — 200, 구매 토큰은 스토어 확인에만 쓰고 지급은 google:<주문 id> · 정가 / 테스트 구매는 0원", async () => {
  const { POST, fakes } = await setup();
  fakes.state.google = googlePurchase();
  const res = await POST(post(androidBody()));
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { ok: true, stars: 10, bonusStars: 2, balance: 27, already: false });
  assert.deepEqual(fakes.state.googleCalls, [{ productId: "star_10", token: PURCHASE_TOKEN }]);
  assert.deepEqual(fakes.state.grantCalls, [
    { userId: fakes.USER_ID, pkg: PKG, provider: "google", tid: `google:${ORDER_ID}`, amountWon: PKG.price },
  ]);

  fakes.state.google = googlePurchase({ sandbox: true, tid: `google-test:${ORDER_ID}` });
  await POST(post(androidBody()));
  assert.equal(fakes.state.grantCalls[1].amountWon, 0);
  assert.equal(fakes.state.grantCalls[1].tid, `google-test:${ORDER_ID}`);
});

test("스토어가 말한 상품이 본문과 다름 — 400 product_mismatch, 지급 0", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase({ productId: "star_300" });
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 400);
  assert.deepEqual(await json(res), { error: "product_mismatch" });
  assert.deepEqual(fakes.state.grantCalls, []);
});

test("다른 회원의 거래(계정 토큰 불일치) — 409 account_mismatch, 지급 0", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase({ accountToken: iapAccountToken("someone-else") });
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 409);
  assert.deepEqual(await json(res), { error: "account_mismatch" });
  fakes.state.google = googlePurchase({ accountToken: iapAccountToken("someone-else") });
  assert.equal((await POST(post(androidBody()))).status, 409);
  assert.deepEqual(fakes.state.grantCalls, []);
  assert.ok(fakes.state.logs.every((l) => l.level === "warn"));
});

test("계정 토큰은 대소문자를 가리지 않는다(스토어가 대문자로 돌려줘도 같은 회원)", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase({ accountToken: mine().toUpperCase() });
  assert.equal((await POST(post(iosBody()))).status, 200);
});

test("계정 토큰을 스토어가 안 실어 줌(null) — 지급하고 warn 을 남긴다", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase({ accountToken: null });
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 200);
  assert.equal(fakes.state.grantCalls.length, 1);
  assert.equal(fakes.state.logs.length, 1);
  assert.equal(fakes.state.logs[0].level, "warn");
});

test("대기 중(pending) 결제 — 402 pending · 환불·취소된(revoked) 결제 — 409 revoked, 둘 다 지급 0", async () => {
  const { POST, fakes } = await setup();
  fakes.state.google = googlePurchase({ pending: true });
  const pending = await POST(post(androidBody()));
  assert.equal(pending.status, 402);
  assert.deepEqual(await json(pending), { error: "pending" });
  fakes.state.apple = applePurchase({ revoked: true });
  const revoked = await POST(post(iosBody()));
  assert.equal(revoked.status, 409);
  assert.deepEqual(await json(revoked), { error: "revoked" });
  assert.deepEqual(fakes.state.grantCalls, []);
});

test("스토어에 그런 거래가 없음(null) — 400 bad_request, 지급 0", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = null;
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 400);
  assert.deepEqual(await json(res), { error: "bad_request" });
  assert.deepEqual(fakes.state.grantCalls, []);
});

test("확인 함수가 던짐(스토어 장애·서명 검증 실패) — 502 store_unreachable + error 로그, 로그에 구매 토큰 없음", async () => {
  const { POST, fakes } = await setup();
  fakes.state.google = new Error("google purchases.products.get HTTP 503");
  const res = await POST(post(androidBody()));
  assert.equal(res.status, 502);
  assert.deepEqual(await json(res), { error: "store_unreachable" });
  fakes.state.apple = new Error("apple down");
  assert.equal((await POST(post(iosBody()))).status, 502);
  assert.deepEqual(fakes.state.grantCalls, []);
  assert.equal(fakes.state.logs.filter((l) => l.level === "error").length, 2);
  assert.ok(!JSON.stringify(fakes.state.logs).includes(PURCHASE_TOKEN));
});

// ───────────────────────── 지급 결과 ─────────────────────────

test("같은 거래 두 번(already, 같은 회원) — 200 already:true, 보너스 0", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase();
  fakes.state.grant = { kind: "already", paymentId: "pay-1", stars: 10, balance: 27, ownerUserId: fakes.USER_ID };
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { ok: true, stars: 10, bonusStars: 0, balance: 27, already: true });
});

test("이미 다른 회원이 받은 거래 — 409 account_mismatch(별은 원래 주인에게만)", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase({ accountToken: null });
  fakes.state.grant = { kind: "already", paymentId: "pay-1", stars: 10, balance: 3, ownerUserId: "someone-else" };
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 409);
  assert.deepEqual(await json(res), { error: "account_mismatch" });
});

test("이미 받은 회원이 탈퇴로 지워진 거래(ownerUserId null) — already 로 본다", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase();
  fakes.state.grant = { kind: "already", paymentId: "pay-1", stars: 10, balance: 0, ownerUserId: null };
  const res = await POST(post(iosBody()));
  assert.equal(res.status, 200);
  assert.equal((await json(res)).already, true);
});

test("기록 실패(insert_failed) — 500 grant_failed + error 로그 / 충전 실패(charge_failed) — 500 grant_failed(지급 함수가 이미 CRITICAL 로그)", async () => {
  const { POST, fakes } = await setup();
  fakes.state.apple = applePurchase();
  fakes.state.grant = { kind: "insert_failed", error: new Error("db down") };
  const a = await POST(post(iosBody()));
  assert.equal(a.status, 500);
  assert.deepEqual(await json(a), { error: "grant_failed" });
  assert.equal(fakes.state.logs.filter((l) => l.level === "error").length, 1);
  fakes.state.grant = { kind: "charge_failed", paymentId: "pay-1" };
  const b = await POST(post(iosBody()));
  assert.equal(b.status, 500);
  assert.deepEqual(await json(b), { error: "grant_failed" });
});

// ───────────────────────── 계정 토큰 ─────────────────────────

test("GET — 로그인 회원의 계정 토큰(캐시 금지) / 비로그인 401", async () => {
  const { GET, fakes } = await setup();
  const res = await GET(get());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await json(res), { accountToken: mine() });
  fakes.state.sessionUserId = null;
  const anon = await GET(get());
  assert.equal(anon.status, 401);
  assert.deepEqual(await json(anon), { error: "unauthenticated" });
});
