// app/api/byeolmaru/subscribe/route.ts — 20별 구독 구매. 일수는 체험 단계가 정한다
// (스펙 docs/superpowers/specs/2026-10-11-별마루-체험중-구독노출-design.md §3-1).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getEntitlement, startTrial } from "@/lib/byeolmaru/entitlement";
import { purchaseByeolmaruSubscription } from "@/lib/byeolmaru/subscription";
import { subscriptionPurchaseDays } from "@/lib/byeolmaru/subscribe-offer";
import { logError, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";

const ROUTE = "/api/byeolmaru/subscribe";

export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "login_required" }, { status: 401 });
  try {
    // 🔴 단계는 서버가 지금 DB 로 판정한다 — 클라가 확인창에 띄운 단계는 문구일 뿐 일수의 근거가 아니다.
    const plan = subscriptionPurchaseDays(await getEntitlement(userId), new Date());
    const r = await purchaseByeolmaruSubscription(userId, plan.days);
    if (!r.success) {
      // 402 는 설계된 정상 신호(잔액 부족 → 그 자리 충전 시트)라 남기지 않는다 — /admin/errors 관례.
      if (r.reason === "insufficient")
        return NextResponse.json({ error: "insufficient_stars", balance: r.balance }, { status: 402 });
      await logError(
        r.error ?? new Error(`purchase_byeolmaru_subscription failed: ${r.reason ?? "unknown"}`),
        ctxFromRequest(req, { route: ROUTE, userId, extra: { reason: r.reason, phase: plan.phase, days: plan.days } })
      );
      return NextResponse.json({ error: "purchase_failed" }, { status: 500 });
    }
    if (plan.recordTrial) {
      // 체험 전 구매 = 체험 3일을 이 구독 안에서 쓴 것. 기록 방식은 체험 버튼과 같다(NULL 일 때만 now).
      // 구매는 이미 성공했으니 기록이 실패해도 응답은 성공 그대로 — 남기기만 한다.
      try {
        await startTrial(userId);
      } catch (e) {
        await logError(e, ctxFromRequest(req, { route: ROUTE, userId, extra: { stage: "record_trial" } }));
      }
    }
    return NextResponse.json({
      success: true,
      balance: r.balance,
      expiresAt: r.expiresAt,
      phase: plan.phase,
      days: plan.days,
    });
  } catch (e) {
    await logError(e, ctxFromRequest(req, { route: ROUTE, userId }));
    return NextResponse.json({ error: "purchase_failed" }, { status: 500 });
  }
}
