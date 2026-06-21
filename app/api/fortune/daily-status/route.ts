// 오늘의 운세 무료 잔여 — 계정당 평생 누적 무료 횟수 기준.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { findTodaysDailyReadingId } from "@/lib/fortune/daily-lookup";
import { getFortuneBonus } from "@/lib/fortune/free-grant";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = FORTUNE_CONFIG.daily;
  const limit = cfg.freeLimit ?? 0;
  const nextCost = cfg.paidCost ?? 0;

  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ used: 0, limit, remaining: limit, nextCost, todayId: null });
  }

  const { count } = await getServiceSupabase()
    .from("readings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("emotion_tag", cfg.emotionTag)
    .eq("stars_spent", 0);

  const used = count ?? 0;
  const bonus = await getFortuneBonus(userId, "daily");
  const remaining = Math.max(0, limit + bonus - used);
  const todayId = await findTodaysDailyReadingId(userId);
  return NextResponse.json({ used, limit, remaining, nextCost, todayId });
}
