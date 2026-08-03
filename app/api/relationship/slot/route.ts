// app/api/relationship/slot/route.ts — 관계 슬롯 구매(2번째 상대부터)
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { purchaseSlot, getSlotInfo } from "@/lib/relationship/slots";

export const dynamic = "force-dynamic";

export async function POST() {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  const res = await purchaseSlot(userId);
  if (!res.success) {
    const status = res.reason === "insufficient" ? 402 : 500;
    return NextResponse.json({ error: res.reason ?? "failed", balance: res.balance }, { status });
  }
  const slot = await getSlotInfo(userId);
  return NextResponse.json({
    success: true, balance: res.balance, allowed: slot.allowed, used: slot.used,
  });
}
