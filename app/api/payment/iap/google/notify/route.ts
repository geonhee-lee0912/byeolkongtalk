// 구글 환불 알림 — 실시간 개발자 알림(RTDN)을 Pub/Sub 푸시 구독이 보낸다(인증 사용 · 서비스 계정 = GOOGLE_PUBSUB_PUSH_EMAIL · 대상 = GOOGLE_PUBSUB_AUDIENCE). 스펙 2026-11-23-앱-결제 §4.
// voidedPurchaseNotification 만 별을 회수하고(google:<주문 id>, 없으면 테스트 결제 google-test:<주문 id>) 시험 알림·다른 종류는 200 으로 흘린다.
// Pub/Sub 은 2xx 가 아니면 다시 보낸다 — 처리·모르는 주문·이미 처리·무시·모양이 틀린 본문(인증은 통과) = 200 / 인증 실패 = 401 / 처리 실패 = 500(다시 받기) / 설정 없음 = 503.
// 🔴 구매 토큰은 로그에 남기지 않는다. 쿠키·세션 없음 — 구글 서버가 부른다.
import { NextResponse, type NextRequest } from "next/server";
import { logError, logInfo, logWarn, ctxFromRequest } from "@/lib/logger";
import { verifyGooglePushAuth } from "@/lib/payment/iap/google";
import { parseGoogleRtdn } from "@/lib/payment/iap/google-rtdn";
import { refundIapPayment, type RefundResult } from "@/lib/payment/iap/refund";
import { iapNotifyConfigured } from "@/lib/payment/iap/verify";

const ROUTE = "/api/payment/iap/google/notify";

const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

export async function POST(request: NextRequest) {
  const ctx = (extra: Record<string, unknown> = {}) => ctxFromRequest(request, { route: ROUTE, extra: { store: "google", ...extra } });

  if (!iapNotifyConfigured("google")) {
    await logError(new Error("IAP refund notify not configured for google (GOOGLE_PUBSUB_PUSH_EMAIL / GOOGLE_PUBSUB_AUDIENCE)"), ctx());
    return reply({ error: "iap_not_configured" }, 503);
  }

  let authorized: boolean;
  try {
    authorized = await verifyGooglePushAuth(request.headers.get("authorization"));
  } catch (err) {
    await logError(err, ctx({ step: "auth" }));
    return reply({ error: "auth_failed" }, 500);
  }
  if (!authorized) {
    // 대상·서비스 계정 설정이 콘솔과 어긋나면 모든 알림이 여기서 막힌다 — 보이게 남긴다(토큰은 싣지 않는다)
    await logWarn("google refund notification auth failed", ctx());
    return reply({ error: "unauthorized" }, 401);
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // 아래 parse 가 malformed 로 본다
  }
  const note = parseGoogleRtdn(body);
  if (note.kind === "malformed") {
    // 우리 구독이 보낸 것인데 모양이 틀림 — 다시 받아도 같으니 200 으로 끝낸다
    await logWarn("google refund notification malformed", ctx());
    return reply({ ok: true, result: "ignored" });
  }
  if (note.kind === "ignored") return reply({ ok: true, result: "ignored" });

  let result: RefundResult = { kind: "not_found" };
  try {
    for (const prefix of ["google:", "google-test:"]) {
      result = await refundIapPayment(prefix + note.orderId);
      if (result.kind !== "not_found") break;
    }
  } catch (err) {
    await logError(err, ctx({ step: "refund" }));
    return reply({ error: "refund_failed" }, 500);
  }
  if (result.kind === "not_found") {
    // 별을 주기 전에 환불됐거나 다른 환경(dev↔운영)의 결제 — 다시 보내도 소용없다
    await logInfo("google refund for unknown payment", ctx());
  }
  return reply({ ok: true, result: result.kind });
}
