// 결제 후 생성 중 이탈 복구용 — 특정 운세 종류의, 지정 시각 이후 가장 최근 리딩 id 조회.
// 클라가 이탈해도 서버 생성은 끝까지 진행되어 리딩이 만들어지므로, 이걸로 되찾는다.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ id: null }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") as FortuneType | null;
  const after = req.nextUrl.searchParams.get("after");
  const cfg = type && type in FORTUNE_CONFIG ? FORTUNE_CONFIG[type] : null;
  if (!cfg) {
    return NextResponse.json({ id: null }, { status: 400 });
  }

  let q = getServiceSupabase()
    .from("readings")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("emotion_tag", cfg.emotionTag)
    .order("created_at", { ascending: false })
    .limit(1);

  if (after) q = q.gte("created_at", after);

  const { data } = await q;
  const id = data && data.length > 0 ? data[0].id : null;
  return NextResponse.json({ id });
}
