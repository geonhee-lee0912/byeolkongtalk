// 운세 리포트 생성 실패 환불 알림 — 조회(GET) + 확인 처리(POST).
// 생성 실패 시 create 라우트의 failGeneration 이 fortune_refund_notices 에 INSERT 한다.
// /fortune 상단 카드가 미확인 알림을 띄우고, '확인'을 누르면 acknowledged_at 마킹 → 다시 안 뜸.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/fortune/refunds — 본인의 미확인 환불 알림
export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ notices: [] });

  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("fortune_refund_notices")
    .select("id, emotion_tag, refunded_stars, created_at")
    .eq("user_id", userId)
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    notices: (data ?? []).map((n) => ({
      id: n.id,
      emotionTag: n.emotion_tag,
      refundedStars: n.refunded_stars,
      createdAt: n.created_at,
    })),
  });
}

// POST /api/fortune/refunds — { id } 확인 처리 (본인 소유만)
export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const supabase = getServiceSupabase();
  await supabase
    .from("fortune_refund_notices")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  return NextResponse.json({ success: true });
}
