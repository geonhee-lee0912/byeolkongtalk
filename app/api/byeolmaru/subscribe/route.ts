// app/api/byeolmaru/subscribe/route.ts — 20별 구독 구매. 일수는 체험 단계가 정한다
// (스펙 docs/superpowers/specs/2026-10-11-별마루-체험중-구독노출-design.md §3-1).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getEntitlement, startTrial } from "@/lib/byeolmaru/entitlement";
import { purchaseByeolmaruSubscription } from "@/lib/byeolmaru/subscription";
import { alreadySubscribedUntil, subscriptionPurchaseDays } from "@/lib/byeolmaru/subscribe-offer";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";

const ROUTE = "/api/byeolmaru/subscribe";

export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "login_required" }, { status: 401 });
  try {
    // 🔴 단계는 서버가 지금 DB 로 판정한다 — 클라가 확인창에 띄운 단계는 문구일 뿐 일수의 근거가 아니다.
    const ent = await getEntitlement(userId);
    // 🔴 이미 구독 중이면 차감 없이 409(사용자 결정 2026-10-12) — 구독자 화면엔 연장 버튼이 없어 이 요청은 낡은
    //    화면(다른 탭에서 막 산 뒤 남은 버튼)에서 온다. 예전엔 RPC 가 30일을 이어 붙이고 20별을 또 뺐다.
    const until = alreadySubscribedUntil(ent);
    if (until) {
      // 설계된 정상 신호(WARN — error 아님). 빈도만 본다 — 늘면 화면 동기화(byeolmaru:entitlement-changed)가 안 먹는다는 뜻
      await logWarn(
        "ALREADY_SUBSCRIBED: 구독 중인 사람의 구독 구매를 차감 전에 막았다(409)",
        ctxFromRequest(req, { route: ROUTE, userId, extra: { expiresAt: until } })
      );
      return NextResponse.json({ error: "already_subscribed", expiresAt: until }, { status: 409 });
    }
    const plan = subscriptionPurchaseDays(ent, new Date());
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
