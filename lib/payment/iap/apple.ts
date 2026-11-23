// 애플 거래 확인 — 앱이 보낸 거래 id 로 App Store Server API(Get Transaction Info)에 직접 묻고, 돌아온 서명 거래(JWS)를
// 애플 루트 인증서(이 폴더의 apple-root-ca-g3.cer)로 검증한다(@apple/app-store-server-library). 스펙 2026-11-23-앱-결제 §3.
// Production 에서 먼저 찾고 없으면(4040010) Sandbox — 앱 심사자는 운영 빌드에서 샌드박스로 산다(그 거래도 별은 준다, 매출 0원).
// 서버 비밀값: APPLE_IAP_KEY_ID · APPLE_IAP_ISSUER_ID · APPLE_IAP_PRIVATE_KEY(앱 결제 키 .p8) · APPLE_APP_ID(숫자 — Production 서명 검증에 필수)
// 환불 알림(App Store Server Notifications v2, 스펙 §4)도 같은 검증기·같은 결제 고유 번호(appleTid)로 푼다 — verifyAppleRefundNotification.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type TransactionInfoResponse,
} from "@apple/app-store-server-library";
import { IAP_APP_ID, type VerifiedPurchase } from "./verify";

/** 라이브러리 자리 — 테스트는 네트워크 없이 이 둘을 바꿔 끼운다 */
export type AppleDeps = {
  getTransactionInfo(environment: Environment, transactionId: string): Promise<TransactionInfoResponse>;
  verifyTransaction(environment: Environment, signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload>;
};

// 루트 인증서는 저장소 파일 — next.config.ts 의 outputFileTracingIncludes 가 이 라우트 함수 묶음에 넣는다(process.cwd() = 프로젝트 루트)
const ROOT_CA_PATH = join(process.cwd(), "lib/payment/iap/apple-root-ca-g3.cer");

const clients = new Map<Environment, AppStoreServerAPIClient>();
const verifiers = new Map<Environment, SignedDataVerifier>();

function client(environment: Environment): AppStoreServerAPIClient {
  let c = clients.get(environment);
  if (!c) {
    const { APPLE_IAP_KEY_ID: keyId, APPLE_IAP_ISSUER_ID: issuerId, APPLE_IAP_PRIVATE_KEY: pem } = process.env;
    if (!keyId || !issuerId || !pem) throw new Error("APPLE_IAP_KEY_ID / APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY not set");
    // Vercel env 에 한 줄로 넣으면 줄바꿈이 '\n' 문자열로 남는다 — 되돌린다(lib/auth/apple.ts 와 같다)
    c = new AppStoreServerAPIClient(pem.replace(/\\n/g, "\n"), keyId, issuerId, IAP_APP_ID, environment);
    clients.set(environment, c);
  }
  return c;
}

function verifier(environment: Environment): SignedDataVerifier {
  let v = verifiers.get(environment);
  if (!v) {
    let appAppleId: number | undefined;
    if (environment === Environment.PRODUCTION) {
      appAppleId = Number(process.env.APPLE_APP_ID);
      if (!Number.isInteger(appAppleId) || appAppleId <= 0) throw new Error("APPLE_APP_ID not set or not numeric");
    }
    // 온라인 확인 켬 — 인증서 폐기(OCSP)·만료를 지금 시각으로 본다
    v = new SignedDataVerifier([readFileSync(ROOT_CA_PATH)], true, environment, IAP_APP_ID, appAppleId);
    verifiers.set(environment, v);
  }
  return v;
}

const realDeps: AppleDeps = {
  getTransactionInfo: (environment, transactionId) => client(environment).getTransactionInfo(transactionId),
  verifyTransaction: (environment, signed) => verifier(environment).verifyAndDecodeTransaction(signed),
};

/** payments.pg_tid — 운영 apple:<transactionId> · 샌드박스(앱 심사자·테스트) apple-sandbox:<transactionId>. 거래 확인과 환불 알림이 같이 쓴다 */
export function appleTid(environment: Environment, transactionId: string): string {
  return (environment === Environment.SANDBOX ? "apple-sandbox:" : "apple:") + transactionId;
}

const apiErrorOf = (err: unknown): unknown => (err instanceof APIException ? err.apiError : undefined);

// 라이브러리 오류는 super() 로 message 없이 만들어져 로거(lib/logger.ts)엔 "Error" 만 남는다 — 상태를 글로 옮긴다.
// node-fetch FetchError 의 글엔 거래 id 가 든 요청 주소가 실려 그 글은 버리고 오류 코드만 남긴다. 우리 쪽 Error(설정 없음 등)는 그대로
function describeLookupError(err: unknown): unknown {
  if (err instanceof APIException) return new Error(`apple getTransactionInfo HTTP ${err.httpStatusCode} apiError ${String(err.apiError)}`);
  if (err instanceof Error && err.name === "FetchError") {
    const code = (err as { code?: unknown }).code;
    return new Error(`apple getTransactionInfo request failed${typeof code === "string" ? ` ${code}` : ""}`);
  }
  return err;
}

function describeVerifyError(err: unknown): unknown {
  if (err instanceof VerificationException) {
    return new Error(`apple JWS verification failed status ${err.status} ${VerificationStatus[err.status] ?? "UNKNOWN"}`);
  }
  return err;
}

/** 거래가 없거나(두 환경 다 4040010)·id 형식이 틀리거나·다른 앱·다른 거래면 null. 애플 장애·키 거절·서명 검증 실패는 던진다 */
export async function verifyAppleTransaction(transactionId: string, deps: AppleDeps = realDeps): Promise<VerifiedPurchase | null> {
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    let info: TransactionInfoResponse;
    try {
      info = await deps.getTransactionInfo(environment, transactionId);
    } catch (err) {
      const code = apiErrorOf(err);
      if (code === APIError.TRANSACTION_ID_NOT_FOUND) continue;
      if (code === APIError.INVALID_TRANSACTION_ID) return null;
      throw describeLookupError(err);
    }
    if (!info.signedTransactionInfo) throw new Error("apple getTransactionInfo: signedTransactionInfo missing");
    // 서명·번들 ID·환경은 라이브러리가 확인한다(틀리면 VerificationException). 아래는 그 위의 이중 확인
    let tx: JWSTransactionDecodedPayload;
    try {
      tx = await deps.verifyTransaction(environment, info.signedTransactionInfo);
    } catch (err) {
      throw describeVerifyError(err);
    }
    if (tx.bundleId !== IAP_APP_ID || tx.transactionId !== transactionId || !tx.productId) return null;
    const sandbox = environment === Environment.SANDBOX;
    return {
      store: "apple",
      productId: tx.productId,
      tid: appleTid(environment, transactionId),
      sandbox,
      accountToken: tx.appAccountToken ? tx.appAccountToken.toLowerCase() : null,
      revoked: !!tx.revocationDate,
      pending: false,
    };
  }
  return null;
}

// ── 환불 알림 ──

/** 라이브러리 자리 — 테스트는 이 둘을 바꿔 끼운다 */
export type AppleNotifyDeps = {
  verifyNotification(environment: Environment, signedPayload: string): Promise<ResponseBodyV2DecodedPayload>;
  verifyTransaction(environment: Environment, signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload>;
};

const realNotifyDeps: AppleNotifyDeps = {
  verifyNotification: (environment, signed) => verifier(environment).verifyAndDecodeNotification(signed),
  verifyTransaction: (environment, signed) => verifier(environment).verifyAndDecodeTransaction(signed),
};

/** invalid = 애플이 서명한 우리 앱 알림이 아니다(라우트 401) · ignored = REFUND 가 아닌 알림(200) · refund = 이 결제를 회수 */
export type AppleNotification =
  | { kind: "invalid"; reason: string }
  | { kind: "ignored"; notificationType: string }
  | { kind: "refund"; tid: string };

// Production 검증기가 이 둘로 거절하면 샌드박스 알림일 수 있다(샌드박스엔 앱 숫자 ID 가 없어 앱 ID 불일치로 먼저 걸린다) — Sandbox 로 한 번 더.
// 받아들이는 쪽 검증기가 서명(고정한 루트 인증서까지의 체인)·번들 ID·환경을 다 확인하므로 거래 확인과 같은 수준이다
const TRY_SANDBOX = new Set<VerificationStatus>([VerificationStatus.INVALID_APP_IDENTIFIER, VerificationStatus.INVALID_ENVIRONMENT]);

/** 알림을 검증해 환불이면 결제 고유 번호를 돌려준다. 인증서 폐기 확인 실패(RETRYABLE)·설정 오류·REFUND 인데 거래가 없거나 거래 검증 실패는 던진다(라우트 500 → 애플이 다시 보낸다) */
export async function verifyAppleRefundNotification(signedPayload: string, deps: AppleNotifyDeps = realNotifyDeps): Promise<AppleNotification> {
  let environment: Environment = Environment.PRODUCTION;
  let note: ResponseBodyV2DecodedPayload;
  try {
    note = await deps.verifyNotification(environment, signedPayload);
  } catch (err) {
    if (!(err instanceof VerificationException) || !TRY_SANDBOX.has(err.status)) return notifyFailure(err);
    environment = Environment.SANDBOX;
    try {
      note = await deps.verifyNotification(environment, signedPayload);
    } catch (err2) {
      return notifyFailure(err2);
    }
  }

  const notificationType = note.notificationType ?? "UNKNOWN";
  if (notificationType !== NotificationTypeV2.REFUND) return { kind: "ignored", notificationType };

  const signedTx = note.data?.signedTransactionInfo;
  if (!signedTx) throw new Error("apple REFUND notification: signedTransactionInfo missing");
  let tx: JWSTransactionDecodedPayload;
  try {
    tx = await deps.verifyTransaction(environment, signedTx);
  } catch (err) {
    throw describeVerifyError(err);
  }
  if (!tx.transactionId) throw new Error("apple REFUND notification: transactionId missing");
  return { kind: "refund", tid: appleTid(environment, tx.transactionId) };
}

/** 서명·체인·앱 불일치 = invalid. 인증서 폐기 확인을 못 함(RETRYABLE)·우리 쪽 오류는 던진다 */
function notifyFailure(err: unknown): AppleNotification {
  if (err instanceof VerificationException && err.status !== VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
    return { kind: "invalid", reason: VerificationStatus[err.status] ?? "UNKNOWN" };
  }
  throw describeVerifyError(err);
}
