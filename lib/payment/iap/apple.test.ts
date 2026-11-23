// 애플 거래 확인(lib/payment/iap/apple.ts) — 네트워크 없이 라이브러리 자리(거래 조회·서명 검증)만 가짜로 끼워
// '거래 → VerifiedPurchase' 매핑과 Production → Sandbox 재시도 규칙을 잠근다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APIError, APIException, Environment } from "@apple/app-store-server-library";
import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { verifyAppleTransaction, type AppleDeps } from "./apple.ts";

globalThis.fetch = (async (input: unknown) => {
  throw new Error(`apple.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const TXN = "2000000000000001";
const TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const payload = (over: Partial<JWSTransactionDecodedPayload> = {}): JWSTransactionDecodedPayload => ({
  transactionId: TXN,
  bundleId: "com.byeolkongtalk.app",
  productId: "star_30",
  appAccountToken: TOKEN,
  ...over,
});

/** env 별 조회 결과: payload = 찾음, Error = 던짐 */
function deps(byEnv: Partial<Record<Environment, JWSTransactionDecodedPayload | Error>>) {
  const calls: { lookups: Environment[]; verifies: { env: Environment; signed: string }[] } = { lookups: [], verifies: [] };
  const d: AppleDeps = {
    async getTransactionInfo(env, transactionId) {
      assert.equal(transactionId, TXN);
      calls.lookups.push(env);
      const r = byEnv[env];
      if (r === undefined) throw new APIException(404, APIError.TRANSACTION_ID_NOT_FOUND, "Transaction id not found.");
      if (r instanceof Error) throw r;
      return { signedTransactionInfo: `signed-${env}` };
    },
    async verifyTransaction(env, signed) {
      calls.verifies.push({ env, signed });
      const r = byEnv[env];
      if (!r || r instanceof Error) throw new Error("unreachable");
      return r;
    },
  };
  return { d, calls };
}

test("Production 에서 찾음 — sandbox false, tid apple:<id>, Sandbox 는 묻지 않는다", async () => {
  const { d, calls } = deps({ [Environment.PRODUCTION]: payload() });
  const v = await verifyAppleTransaction(TXN, d);
  assert.deepEqual(v, {
    store: "apple",
    productId: "star_30",
    tid: `apple:${TXN}`,
    sandbox: false,
    accountToken: TOKEN,
    revoked: false,
    pending: false,
  });
  assert.deepEqual(calls.lookups, [Environment.PRODUCTION]);
  assert.deepEqual(calls.verifies, [{ env: Environment.PRODUCTION, signed: `signed-${Environment.PRODUCTION}` }]);
});

test("Production 에 없음(4040010) → Sandbox 재시도 — sandbox true, tid apple-sandbox:<id>, 검증도 Sandbox 로", async () => {
  const { d, calls } = deps({ [Environment.SANDBOX]: payload() });
  const v = await verifyAppleTransaction(TXN, d);
  assert.equal(v?.sandbox, true);
  assert.equal(v?.tid, `apple-sandbox:${TXN}`);
  assert.deepEqual(calls.lookups, [Environment.PRODUCTION, Environment.SANDBOX]);
  assert.deepEqual(calls.verifies.map((c) => c.env), [Environment.SANDBOX]);
});

test("두 환경 다 없음 → null", async () => {
  const { d, calls } = deps({});
  assert.equal(await verifyAppleTransaction(TXN, d), null);
  assert.deepEqual(calls.lookups, [Environment.PRODUCTION, Environment.SANDBOX]);
});

test("거래 id 형식이 틀림(4000006) → null, Sandbox 재시도 안 함", async () => {
  const { d, calls } = deps({
    [Environment.PRODUCTION]: new APIException(400, APIError.INVALID_TRANSACTION_ID, "Invalid transaction id."),
  });
  assert.equal(await verifyAppleTransaction(TXN, d), null);
  assert.deepEqual(calls.lookups, [Environment.PRODUCTION]);
});

test("그 밖의 애플 오류(키 거절 401·장애 500)는 던진다 — Sandbox 로 넘어가 가리지 않는다", async () => {
  for (const status of [401, 500]) {
    const { d, calls } = deps({ [Environment.PRODUCTION]: new APIException(status, null, "boom") });
    await assert.rejects(verifyAppleTransaction(TXN, d), APIException);
    assert.deepEqual(calls.lookups, [Environment.PRODUCTION]);
  }
});

test("서명 검증 실패는 던진다", async () => {
  const { d } = deps({ [Environment.PRODUCTION]: payload() });
  d.verifyTransaction = async () => {
    throw new Error("VerificationException");
  };
  await assert.rejects(verifyAppleTransaction(TXN, d));
});

test("signedTransactionInfo 가 비면 던진다", async () => {
  const { d } = deps({ [Environment.PRODUCTION]: payload() });
  d.getTransactionInfo = async () => ({});
  await assert.rejects(verifyAppleTransaction(TXN, d));
});

test("환불·취소(revocationDate) → revoked true", async () => {
  const { d } = deps({ [Environment.PRODUCTION]: payload({ revocationDate: 1_760_000_000_000 }) });
  assert.equal((await verifyAppleTransaction(TXN, d))?.revoked, true);
});

test("계정 토큰 — 없으면 null, 대문자면 소문자로", async () => {
  const none = deps({ [Environment.PRODUCTION]: payload({ appAccountToken: undefined }) });
  assert.equal((await verifyAppleTransaction(TXN, none.d))?.accountToken, null);
  const upper = deps({ [Environment.PRODUCTION]: payload({ appAccountToken: TOKEN.toUpperCase() }) });
  assert.equal((await verifyAppleTransaction(TXN, upper.d))?.accountToken, TOKEN);
});

test("번들 ID·거래 id 가 다르거나 상품 id 가 없으면 null(다른 앱·다른 거래)", async () => {
  for (const over of [{ bundleId: "com.byeolkongtalk.app.dev" }, { transactionId: "2000000000000002" }, { productId: undefined }]) {
    const { d } = deps({ [Environment.PRODUCTION]: payload(over) });
    assert.equal(await verifyAppleTransaction(TXN, d), null, JSON.stringify(over));
  }
});
