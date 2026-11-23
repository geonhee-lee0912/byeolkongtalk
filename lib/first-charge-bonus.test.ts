// 첫충전 보너스 — 결제 승인(app/api/payment/confirm/route.ts)이 실제로 주는 것과 상점 배너(app/api/stars/first-charge-status/route.ts)가
// 약속하는 것이 같은 원장 키(로그인 수단 해시)를 보는지, 로그인 수단 조회가 실패해도 결제 자체는 성공으로 끝나는지를 잠근다(스펙 2026-10-12-앱-1 §9).
// 🔴 카카오 키가 옛 공식(sha256(String(kakao_id)))에서 벗어나면 이미 받은 사람이 또 받는다 — bonus_claims 는 2026-07 부터 쌓여 있다.
// 의존성은 resolve 훅으로 ./first-charge-bonus.fakes.ts 로 바꿔 끼운다. 로그인 수단 조회(lib/auth/user-identity.ts)·해시·패키지 상수는 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./first-charge-bonus.fakes.ts";

// 이 경로엔 실제 네트워크가 없어야 한다(토스·DB·CAPI 는 전부 가짜) — 새 import 가 실서버로 새면 여기서 바로 드러난다
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`first-charge-bonus.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

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

const FAKES_URL = new URL("./first-charge-bonus.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = ["/lib/supabase.ts", "/lib/session.ts", "/lib/logger.ts", "/lib/toss.ts", "/lib/stars.ts", "/lib/meta-capi.ts"];

type Routes = {
  confirmPOST: (request: NextRequest) => Promise<Response>;
  statusGET: () => Promise<Response>;
  fakes: typeof Fakes;
};
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
    const { POST } = await import("@/app/api/payment/confirm/route");
    const { GET } = await import("@/app/api/stars/first-charge-status/route");
    return { confirmPOST: POST, statusGET: GET, fakes };
  })();
  return loaded;
}

const BASE = "http://localhost:3000";
const KAKAO_ID = 4123456789;
const APPLE_SUB = "001234.0a1b2c3d4e5f60718293a4b5c6d7e8f9.0123";
const PAYMENT_KEY = "tgen_20261016000000abcd";
const ORDER_ID = "order_star_70_1760000000000_abc123"; // star_70 = 70별 · 5,900원 → 첫충전 보너스 round(70×0.2) = 14
const BONUS = 14;

/** 웰컴·첫충전 원장에 2026-07 부터 쌓인 카카오 공식 */
const kakaoLedgerHash = (id: number) => createHash("sha256").update(String(id)).digest("hex");
/** 애플은 카카오 값과 겹치지 않게 접두를 붙인다 */
const appleLedgerHash = (sub: string) => createHash("sha256").update(`apple:${sub}`).digest("hex");

const kakaoRow = () => ({ provider: "kakao", provider_user_id: String(KAKAO_ID), apple_client_id: null, apple_refresh_token_enc: null });
const appleRow = () => ({ provider: "apple", provider_user_id: APPLE_SUB, apple_client_id: "com.byeolkongtalk.app.dev", apple_refresh_token_enc: null });

type Setup = (s: typeof Fakes.state) => void;
/** 회원 3종 — 결제 승인과 자격 조회가 같은 키를 봐야 한다 */
const MEMBERS: [name: string, setup: Setup, hash: string][] = [
  [
    "카카오(로그인 수단 행 — 전환기라 users.kakao_id 도 채워져 있다)",
    (st) => {
      st.identities = [kakaoRow()];
      st.userRow = { kakao_id: KAKAO_ID };
    },
    kakaoLedgerHash(KAKAO_ID),
  ],
  [
    "카카오(옮겨 담기 전 — 행 없음 → users.kakao_id 보충)",
    (st) => {
      st.identities = [];
      st.userRow = { kakao_id: KAKAO_ID };
    },
    kakaoLedgerHash(KAKAO_ID),
  ],
  ["애플", (st) => (st.identities = [appleRow()]), appleLedgerHash(APPLE_SUB)],
];

async function confirm(setup: Setup = () => {}) {
  const { confirmPOST, fakes } = await load();
  fakes.reset();
  setup(fakes.state);
  const res = await confirmPOST(
    new NextRequest(`${BASE}/api/payment/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentKey: PAYMENT_KEY, orderId: ORDER_ID, amount: 5900 }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, s: fakes.state, USER_ID: fakes.USER_ID, PAYMENT_ID: fakes.PAYMENT_ID };
}

async function eligibility(setup: Setup = () => {}) {
  const { statusGET, fakes } = await load();
  fakes.reset();
  setup(fakes.state);
  const res = await statusGET();
  return { body: (await res.json()) as { eligible: boolean }, s: fakes.state };
}

const ledgerRow = (hash: string) => ({ kakao_id_hash: hash, bonus_type: "first_charge" });

test("결제 승인 — 회원별 원장 키로 1회 청구하고 처음이면 +20% 지급(카카오는 옛 공식 그대로)", async () => {
  for (const [name, setup, hash] of MEMBERS) {
    const { status, body, s, USER_ID, PAYMENT_ID } = await confirm(setup);
    assert.equal(status, 200, name);
    assert.deepEqual(body, { success: true, stars: 70, bonusStars: BONUS, balance: 99, paymentKey: PAYMENT_KEY }, name);
    assert.deepEqual(
      s.upserts,
      [{ table: "bonus_claims", row: ledgerRow(hash), opts: { onConflict: "kakao_id_hash,bonus_type", ignoreDuplicates: true } }],
      name,
    );
    assert.deepEqual(
      s.charges,
      [
        { userId: USER_ID, amount: 70, paymentId: PAYMENT_ID, source: "pg" },
        { userId: USER_ID, amount: BONUS, paymentId: `first_bonus:${USER_ID}`, source: "first_charge_bonus" },
      ],
      name,
    );
    assert.deepEqual(s.logs, [], name);
  }
});

test("결제 승인 — 원장에 이미 그 키가 있으면(옛 코드가 남긴 카카오 청구 포함) 또 주지 않는다", async () => {
  for (const [name, setup, hash] of MEMBERS) {
    const { status, body, s } = await confirm((st) => {
      setup(st);
      st.ledger = [ledgerRow(hash)];
    });
    assert.equal(status, 200, name);
    assert.deepEqual(body, { success: true, stars: 70, bonusStars: 0, balance: 85, paymentKey: PAYMENT_KEY }, name);
    assert.deepEqual(s.charges.map((c) => c.source), ["pg"], name);
  }
});

test("결제 승인 — 로그인 수단 조회 실패·수단 없음이면 원장을 건드리지 않고(다음 결제에 받는다) 결제는 200 성공 + 오류 로그", async () => {
  const cases: [string, Setup][] = [
    ["수단 표 오류", (st) => (st.identitiesError = { message: "boom", code: "XX000" })],
    [
      "보충 조회 오류",
      (st) => {
        st.identities = [];
        st.userError = { message: "boom", code: "XX000" };
      },
    ],
    ["수단 없음(행도 kakao_id 도 없음)", (st) => (st.identities = [])],
  ];
  for (const [name, setup] of cases) {
    const { status, body, s } = await confirm(setup);
    assert.equal(status, 200, name); // 토스 승인·별 충전은 끝났다 — 보너스 판정 때문에 결제를 실패로 보이면 안 된다
    assert.deepEqual(body, { success: true, stars: 70, bonusStars: 0, balance: 85, paymentKey: PAYMENT_KEY }, name);
    assert.deepEqual(s.upserts, [], name); // 청구하지 않았으니 다음 결제에서 첫충전으로 받는다
    assert.deepEqual(s.charges.map((c) => c.source), ["pg"], name);
    assert.ok(!s.calls.includes("cancelPayment"), name);
    assert.ok(s.calls.includes("capi:Purchase"), name);
    assert.ok(
      s.logs.some((l) => l.level === "error" && l.extra.severity === "FIRST_BONUS_KAKAO_LOOKUP_FAILED"),
      name,
    );
  }
});

test("결제 승인 — 같은 paymentKey 재호출(이미 completed)은 토스 승인·수단 조회·원장 청구 없이 멱등 응답", async () => {
  const { status, body, s } = await confirm((st) => {
    st.identities = [kakaoRow()];
    st.existingPayment = { id: "pay-old", status: "completed", stars_given: 70 };
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, alreadyProcessed: true, stars: 70, bonusStars: 0, balance: 85, paymentKey: PAYMENT_KEY });
  assert.deepEqual(s.calls, ["getSession", "select:payments", "select:star_balances"]);
});

test("자격 조회(상점 배너) — 결제 승인이 청구하는 것과 같은 키를 본다", async () => {
  for (const [name, setup, hash] of MEMBERS) {
    const fresh = await eligibility(setup);
    assert.deepEqual(fresh.body, { eligible: true }, name);
    assert.deepEqual(
      fresh.s.selects.find((q) => q.table === "bonus_claims")?.filters,
      [
        ["kakao_id_hash", hash],
        ["bonus_type", "first_charge"],
      ],
      name,
    );
    const claimed = await eligibility((st) => {
      setup(st);
      st.ledger = [ledgerRow(hash)];
    });
    assert.deepEqual(claimed.body, { eligible: false }, name);
  }
});

test("자격 조회 — 비로그인·수단 조회 실패·수단 없음이면 false(허위 프로모 방지)", async () => {
  const cases: [string, Setup][] = [
    ["비로그인", (st) => (st.sessionUserId = null)],
    ["수단 표 오류", (st) => (st.identitiesError = { message: "boom", code: "XX000" })],
    ["수단 없음", (st) => (st.identities = [])],
  ];
  for (const [name, setup] of cases) {
    const { body, s } = await eligibility(setup);
    assert.deepEqual(body, { eligible: false }, name);
    assert.ok(!s.calls.includes("select:bonus_claims"), name);
  }
});

test("자격 조회 — 원장 조회가 실패하면 false(이미 받은 사람에게 +20% 를 약속하지 않게)", async () => {
  const { body } = await eligibility((st) => {
    st.identities = [kakaoRow()];
    st.claimSelectError = { message: "boom", code: "XX000" };
  });
  assert.deepEqual(body, { eligible: false });
});
