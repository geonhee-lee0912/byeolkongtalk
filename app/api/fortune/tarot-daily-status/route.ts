// 오늘의 타로 무료 잔여 — 계정당 평생 누적 무료 횟수 기준.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = FORTUNE_CONFIG.tarot_daily;
  const limit = cfg.freeLimit ?? 0;
  const nextCost = cfg.paidCost ?? 0;

  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ used: 0, limit, remaining: limit, nextCost });
  }

  const { count } = await getServiceSupabase()
    .from("readings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("emotion_tag", cfg.emotionTag)
    .eq("stars_spent", 0);

  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);
  return NextResponse.json({ used, limit, remaining, nextCost });
}
