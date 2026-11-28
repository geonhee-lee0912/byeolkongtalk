import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { isHiddenStarTx, starTxSignedAmount } from "@/lib/wallet-history";

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
    .select("id, type, amount, balance_after, source, payment_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("star transactions list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const transactions = (data ?? []).filter((t) => !isHiddenStarTx(t.type, t.amount)).map((t) => ({
    id: t.id,
    type: t.type as "charge" | "spend" | "bonus" | "refund",
    typeLabel: TYPE_LABEL[t.type] ?? t.type,
    signedAmount: starTxSignedAmount(t.type, t.amount),
    balanceAfter: t.balance_after,
    source: t.source,
    // 결제 충전(pg)만 — 내역 화면이 결제 줄과 짝짓는 데 쓴다(lib/wallet-history mergeHistory, 디자인 다듬기 결제 내역 11-22).
    // 다른 충전의 payment_id 는 내부 멱등키('first_bonus:<회원 id>' 등)라 내보내지 않는다
    paymentId: t.type === "charge" && t.source === "pg" ? t.payment_id : null,
    createdAt: new Date(t.created_at).getTime(),
  }));

  return NextResponse.json({ transactions });
}
