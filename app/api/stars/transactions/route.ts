import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  charge: "충전",
  spend: "사용",
  bonus: "보너스",
  refund: "환불",
};

/** 현재 로그인 유저의 별 트랜잭션 내역 (최신순). 게스트는 빈 배열. */
export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ transactions: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("star_transactions")
    .select("id, type, amount, balance_after, source, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("star transactions list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const transactions = (data ?? []).map((t) => ({
    id: t.id,
    type: t.type as "charge" | "spend" | "bonus" | "refund",
    typeLabel: TYPE_LABEL[t.type] ?? t.type,
    signedAmount: t.type === "spend" ? -Math.abs(t.amount) : Math.abs(t.amount),
    balanceAfter: t.balance_after,
    source: t.source,
    createdAt: new Date(t.created_at).getTime(),
  }));

  return NextResponse.json({ transactions });
}
