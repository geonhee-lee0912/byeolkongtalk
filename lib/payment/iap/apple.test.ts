// 애플 거래 확인(lib/payment/iap/apple.ts) — 네트워크 없이 라이브러리 자리(거래 조회·서명 검증)만 가짜로 끼워
// '거래 → VerifiedPurchase' 매핑과 Production → Sandbox 재시도 규칙을 잠근다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APIError, APIException, Environment, NotificationTypeV2, VerificationException, VerificationStatus } from "@apple/app-store-server-library";
import type { JWSTransactionDecodedPayload, ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";
import { verifyAppleRefundNotification, verifyAppleTransaction, type AppleDeps, type AppleNotifyDeps } from "./apple.ts";

globalThis.fetch = (async (input: unknown) => {
  throw new Error(`apple.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const TXN = "2000000000000001";
const TOKEN = "test-app-account-token"; // 검증 코드는 모양을 보지 않는다 — 공개 저장소라 UUID 모양을 쓰지 않는다

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

// 라이브러리 오류(APIException·VerificationException)는 message 가 빈 채 만들어져 로그엔 "Error" 만 남는다 — 상태를 글로 옮겨 다시 던지는지 본다
const noIds = (err: Error) => !err.message.includes(TXN);

test("그 밖의 애플 오류(키 거절 401·장애 500)는 던진다 — Sandbox 로 넘어가 가리지 않고, 오류 글에 HTTP 상태·apiError(거래 id 는 없이)", async () => {
  const cases: [number, number | null, string][] = [
    [401, null, "apple getTransactionInfo HTTP 401 apiError null"],
    [500, APIError.GENERAL_INTERNAL, `apple getTransactionInfo HTTP 500 apiError ${APIError.GENERAL_INTERNAL}`],
  ];
  for (const [status, apiError, message] of cases) {
    const { d, calls } = deps({ [Environment.PRODUCTION]: new APIException(status, apiError, "boom") });
    await assert.rejects(verifyAppleTransaction(TXN, d), (err: Error) => {
      assert.equal(err.message, message);
      assert.ok(noIds(err));
      return true;
    });
    assert.deepEqual(calls.lookups, [Environment.PRODUCTION]);
  }
});

test("애플 요청 자체가 실패(node-fetch FetchError — 글에 거래 id 가 든 주소가 실린다) → 주소를 버리고 오류 코드만", async () => {
  const fetchErr = Object.assign(new Error(`request to https://api.storekit.itunes.apple.com/inApps/v1/transactions/${TXN} failed`), {
    name: "FetchError",
    code: "ECONNRESET",
  });
  const { d } = deps({ [Environment.PRODUCTION]: fetchErr });
  await assert.rejects(verifyAppleTransaction(TXN, d), (err: Error) => {
    assert.equal(err.message, "apple getTransactionInfo request failed ECONNRESET");
    assert.ok(noIds(err));
    return true;
  });
});

test("설정 오류(키 없음 등 우리 쪽 Error)는 글 그대로 던진다", async () => {
  const { d } = deps({ [Environment.PRODUCTION]: new Error("APPLE_IAP_KEY_ID / APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY not set") });
  await assert.rejects(verifyAppleTransaction(TXN, d), /APPLE_IAP_KEY_ID .* not set/);
});

test("서명 검증 실패(VerificationException)는 상태 번호·이름을 글로 옮겨 던진다", async () => {
  const { d } = deps({ [Environment.PRODUCTION]: payload() });
  d.verifyTransaction = async () => {
    throw new VerificationException(VerificationStatus.INVALID_CERTIFICATE);
  };
  await assert.rejects(verifyAppleTransaction(TXN, d), (err: Error) => {
    assert.equal(err.message, `apple JWS verification failed status ${VerificationStatus.INVALID_CERTIFICATE} INVALID_CERTIFICATE`);
    return true;
  });
});

test("검증기 준비 실패(APPLE_APP_ID 숫자 아님 등 우리 쪽 Error)는 글 그대로 던진다", async () => {
  const { d } = deps({ [Environment.PRODUCTION]: payload() });
  d.verifyTransaction = async () => {
    throw new Error("APPLE_APP_ID not set or not numeric");
  };
  await assert.rejects(verifyAppleTransaction(TXN, d), /APPLE_APP_ID not set or not numeric/);
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

test("IAP_APP_ID 를 바꾸면(dev 의 .dev 앱 시험) 그 번들만 받는다 — 운영 번들 거래는 null", async () => {
  const saved = process.env.IAP_APP_ID;
  process.env.IAP_APP_ID = "com.byeolkongtalk.app.dev";
  try {
    const dev = deps({ [Environment.PRODUCTION]: payload({ bundleId: "com.byeolkongtalk.app.dev" }) });
    assert.equal((await verifyAppleTransaction(TXN, dev.d))?.productId, "star_30");
    const prod = deps({ [Environment.PRODUCTION]: payload() });
    assert.equal(await verifyAppleTransaction(TXN, prod.d), null);
  } finally {
    if (saved === undefined) delete process.env.IAP_APP_ID;
    else process.env.IAP_APP_ID = saved;
  }
});

// ── 환불 알림(App Store Server Notifications v2) — 스펙 §4 ──
// 알림이 주장하는 환경의 검증기로 서명·번들 ID·앱 ID(운영)를 확인한다. Production 검증기가 앱 ID·환경 불일치로 거절하면 Sandbox 로 한 번 더.
// REFUND 만 처리하고, 그 안의 거래도 같은 환경 검증기로 풀어 거래 확인과 같은 결제 고유 번호(apple: / apple-sandbox:)를 만든다.

type NotifyResult = ResponseBodyV2DecodedPayload | Error;
function notifyDeps(byEnv: Partial<Record<Environment, NotifyResult>>, tx: JWSTransactionDecodedPayload | Error = payload()) {
  const calls: { notifications: Environment[]; transactions: { env: Environment; signed: string }[] } = { notifications: [], transactions: [] };
  const d: AppleNotifyDeps = {
    async verifyNotification(env, signed) {
      assert.equal(signed, "signed-notification");
      calls.notifications.push(env);
      const r = byEnv[env] ?? new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
      if (r instanceof Error) throw r;
      return r;
    },
    async verifyTransaction(env, signed) {
      calls.transactions.push({ env, signed });
      if (tx instanceof Error) throw tx;
      return tx;
    },
  };
  return { d, calls };
}
const refundNote = (over: Partial<ResponseBodyV2DecodedPayload> = {}): ResponseBodyV2DecodedPayload => ({
  notificationType: NotificationTypeV2.REFUND,
  data: { bundleId: "com.byeolkongtalk.app", signedTransactionInfo: "signed-tx" },
  ...over,
});

test("알림 — Production REFUND → refund, 거래도 Production 검증기로 풀어 tid apple:<id>", async () => {
  const { d, calls } = notifyDeps({ [Environment.PRODUCTION]: refundNote() });
  assert.deepEqual(await verifyAppleRefundNotification("signed-notification", d), { kind: "refund", tid: `apple:${TXN}` });
  assert.deepEqual(calls.notifications, [Environment.PRODUCTION]);
  assert.deepEqual(calls.transactions, [{ env: Environment.PRODUCTION, signed: "signed-tx" }]);
});

test("알림 — Production 검증기가 앱 ID·환경 불일치로 거절하면 Sandbox 로 — tid apple-sandbox:<id>, 거래도 Sandbox 로", async () => {
  for (const status of [VerificationStatus.INVALID_APP_IDENTIFIER, VerificationStatus.INVALID_ENVIRONMENT]) {
    const { d, calls } = notifyDeps({
      [Environment.PRODUCTION]: new VerificationException(status),
      [Environment.SANDBOX]: refundNote(),
    });
    assert.deepEqual(await verifyAppleRefundNotification("signed-notification", d), { kind: "refund", tid: `apple-sandbox:${TXN}` });
    assert.deepEqual(calls.notifications, [Environment.PRODUCTION, Environment.SANDBOX]);
    assert.deepEqual(calls.transactions.map((c) => c.env), [Environment.SANDBOX]);
  }
});

test("알림 — 서명·인증서 검증 실패 → invalid(라우트 401), Sandbox 로 넘어가지 않는다", async () => {
  for (const status of [VerificationStatus.VERIFICATION_FAILURE, VerificationStatus.INVALID_CERTIFICATE, VerificationStatus.INVALID_CHAIN_LENGTH]) {
    const { d, calls } = notifyDeps({ [Environment.PRODUCTION]: new VerificationException(status) });
    assert.deepEqual(await verifyAppleRefundNotification("signed-notification", d), { kind: "invalid", reason: VerificationStatus[status] });
    assert.deepEqual(calls.notifications, [Environment.PRODUCTION]);
    assert.equal(calls.transactions.length, 0);
  }
});

test("알림 — 두 환경 다 거절(다른 앱의 알림) → invalid", async () => {
  const { d, calls } = notifyDeps({
    [Environment.PRODUCTION]: new VerificationException(VerificationStatus.INVALID_APP_IDENTIFIER),
    [Environment.SANDBOX]: new VerificationException(VerificationStatus.INVALID_APP_IDENTIFIER),
  });
  assert.deepEqual(await verifyAppleRefundNotification("signed-notification", d), { kind: "invalid", reason: "INVALID_APP_IDENTIFIER" });
  assert.deepEqual(calls.notifications, [Environment.PRODUCTION, Environment.SANDBOX]);
});

test("알림 — 인증서 폐기 확인을 못 함(RETRYABLE) → 던진다(라우트 500 → 애플이 다시 보낸다), 글에 상태 이름", async () => {
  const { d } = notifyDeps({ [Environment.PRODUCTION]: new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) });
  await assert.rejects(verifyAppleRefundNotification("signed-notification", d), (err: Error) => {
    assert.equal(
      err.message,
      `apple JWS verification failed status ${VerificationStatus.RETRYABLE_VERIFICATION_FAILURE} RETRYABLE_VERIFICATION_FAILURE`,
    );
    return true;
  });
});

test("알림 — 설정 오류(APPLE_APP_ID 숫자 아님 등 우리 쪽 Error)는 그대로 던진다", async () => {
  const { d } = notifyDeps({ [Environment.PRODUCTION]: new Error("APPLE_APP_ID not set or not numeric") });
  await assert.rejects(verifyAppleRefundNotification("signed-notification", d), /APPLE_APP_ID not set or not numeric/);
});

test("알림 — REFUND 가 아닌 종류(REFUND_REVERSED·CONSUMPTION_REQUEST·TEST)는 ignored, 거래를 풀지 않는다", async () => {
  for (const notificationType of [NotificationTypeV2.REFUND_REVERSED, NotificationTypeV2.CONSUMPTION_REQUEST, NotificationTypeV2.TEST]) {
    const { d, calls } = notifyDeps({ [Environment.PRODUCTION]: refundNote({ notificationType }) });
    assert.deepEqual(await verifyAppleRefundNotification("signed-notification", d), { kind: "ignored", notificationType });
    assert.equal(calls.transactions.length, 0);
  }
});

test("알림 — REFUND 인데 거래가 없거나·거래 검증이 실패하면 던진다(라우트 500)", async () => {
  const empty = notifyDeps({ [Environment.PRODUCTION]: refundNote({ data: { bundleId: "com.byeolkongtalk.app" } }) });
  await assert.rejects(verifyAppleRefundNotification("signed-notification", empty.d), /signedTransactionInfo/);
  const bad = notifyDeps({ [Environment.PRODUCTION]: refundNote() }, new VerificationException(VerificationStatus.INVALID_ENVIRONMENT));
  await assert.rejects(verifyAppleRefundNotification("signed-notification", bad.d), /apple JWS verification failed status 4 INVALID_ENVIRONMENT/);
  const noId = notifyDeps({ [Environment.PRODUCTION]: refundNote() }, payload({ transactionId: undefined }));
  await assert.rejects(verifyAppleRefundNotification("signed-notification", noId.d), /transactionId/);
});
