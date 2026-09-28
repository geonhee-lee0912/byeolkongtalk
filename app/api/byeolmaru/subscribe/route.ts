// app/api/byeolmaru/subscribe/route.ts — 20별/30일 구독 구매.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { purchaseByeolmaruSubscription } from "@/lib/byeolmaru/subscription";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const r = await purchaseByeolmaruSubscription(userId);
  if (!r.success) {
    if (r.reason === "insufficient")
      return NextResponse.json({ error: "insufficient_stars", balance: r.balance }, { status: 402 });
    return NextResponse.json({ error: "purchase_failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true, balance: r.balance, expiresAt: r.expiresAt });
}
