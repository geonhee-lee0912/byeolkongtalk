// 애플 환불 알림 — App Store Server Notifications v2 가 { signedPayload } 를 보낸다(App Store Connect 의 서버 알림 주소). 스펙 2026-11-23-앱-결제 §4.
// 서명은 애플 루트 인증서까지 검증한다(lib/payment/iap/apple.ts). REFUND 만 별을 회수하고 나머지 종류는 200 으로 흘린다.
// 상태 코드: 처리·모르는 결제·이미 처리·무시 = 200 / 본문이 틀림 = 400(로그 없음) / 서명 실패 = 401 / 처리 실패 = 500(애플이 다시 보낸다) / 설정 없음 = 503.
// 쿠키·세션 없음 — 애플 서버가 부른다.
import { NextResponse, type NextRequest } from "next/server";
import { logError, logInfo, logWarn, ctxFromRequest } from "@/lib/logger";
import { verifyAppleRefundNotification, type AppleNotification } from "@/lib/payment/iap/apple";
import { refundIapPayment, type RefundResult } from "@/lib/payment/iap/refund";
import { iapNotifyConfigured } from "@/lib/payment/iap/verify";

const ROUTE = "/api/payment/iap/apple/notify";
/** 알림 JWS(인증서 3장 + 안에 거래 JWS·갱신 JWS)는 수십 KB — 넉넉히 잡고 그 위는 거절한다 */
const BODY_MAX = 200_000;

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

async function signedPayloadOf(request: NextRequest): Promise<string | null> {
  try {
    const text = await request.text();
    if (text.length > BODY_MAX) return null;
    const body: unknown = JSON.parse(text);
    const signed = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).signedPayload : undefined;
    return typeof signed === "string" && signed ? signed : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const ctx = (extra: Record<string, unknown> = {}) => ctxFromRequest(request, { route: ROUTE, extra: { store: "apple", ...extra } });

  // 아무나 부를 수 있는 주소 — 모양이 틀린 본문엔 로그도 남기지 않는다(재시도·로그 폭주 방지)
  const signedPayload = await signedPayloadOf(request);
  if (!signedPayload) return reply({ error: "bad_request" }, 400);

  if (!iapNotifyConfigured("apple")) {
    await logError(new Error("IAP refund notify not configured for apple (APPLE_APP_ID)"), ctx());
    return reply({ error: "iap_not_configured" }, 503);
  }

  let note: AppleNotification;
  try {
    note = await verifyAppleRefundNotification(signedPayload);
  } catch (err) {
    await logError(err, ctx({ step: "verify" }));
    return reply({ error: "verify_failed" }, 500);
  }
  if (note.kind === "invalid") {
    await logWarn("apple refund notification verification failed", ctx({ reason: note.reason }));
    return reply({ error: "unauthorized" }, 401);
  }
  if (note.kind === "ignored") return reply({ ok: true, result: "ignored" });

  let result: RefundResult;
  try {
    result = await refundIapPayment(note.tid);
  } catch (err) {
    await logError(err, ctx({ step: "refund" }));
    return reply({ error: "refund_failed" }, 500);
  }
  if (result.kind === "not_found") {
    // 별을 주기 전에 환불됐거나(앱이 확인 라우트를 못 부름) 다른 환경(dev↔운영)의 결제 — 다시 보내도 소용없다
    await logInfo("apple refund for unknown payment", ctx({ sandbox: note.tid.startsWith("apple-sandbox:") }));
  }
  return reply({ ok: true, result: result.kind });
}
