import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 현재 로그인 유저의 결제 내역 (최신순). 게스트는 빈 배열.
 */
export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ payments: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount_won, stars_given, package_type, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("payments list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payments = (data ?? []).map((p) => ({
    id: p.id,
    packageLabel: labelFromPackageType(p.package_type),
    stars: p.stars_given,
    amount: p.amount_won,
    status: p.status as "pending" | "completed" | "refunded",
    paidAt: new Date(p.created_at).getTime(),
  }));

  return NextResponse.json({ payments });
}

function labelFromPackageType(type: string): string {
  // 예: 'star_80' → '80별 패키지'
  const m = type.match(/^star_(\d+)$/);
  if (m) return `${m[1]}별 패키지`;
  return type;
}
