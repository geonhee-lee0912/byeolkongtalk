// 구글 실시간 개발자 알림(RTDN) 해석 — Pub/Sub 푸시 본문 { message: { data: base64(JSON) } } 에서 환불(voidedPurchaseNotification)만 꺼낸다. 스펙 2026-11-23-앱-결제 §4.
// 순수 함수 — 인증(lib/payment/iap/google.ts verifyGooglePushAuth)을 통과한 본문만 여기 온다.
// developer.android.com/google/play/billing/rtdn-reference
import { IAP_APP_ID } from "./verify";

/** voided = 이 주문을 환불 회수 · ignored = 시험 알림·다른 종류·다른 앱 · malformed = 모양이 틀림 */
export type GoogleRtdn = { kind: "voided"; orderId: string } | { kind: "ignored"; reason: "testNotification" | "other" | "package" } | { kind: "malformed" };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseGoogleRtdn(body: unknown): GoogleRtdn {
  const data = isObject(body) && isObject(body.message) ? body.message.data : undefined;
  if (typeof data !== "string") return { kind: "malformed" };
  let note: unknown;
  try {
    note = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return { kind: "malformed" };
  }
  if (!isObject(note)) return { kind: "malformed" };
  if (note.packageName !== IAP_APP_ID) return { kind: "ignored", reason: "package" };
  if (note.testNotification !== undefined) return { kind: "ignored", reason: "testNotification" };
  const voided = note.voidedPurchaseNotification;
  if (voided === undefined) return { kind: "ignored", reason: "other" };
  if (!isObject(voided) || typeof voided.orderId !== "string" || !voided.orderId) return { kind: "malformed" };
  return { kind: "voided", orderId: voided.orderId };
}
