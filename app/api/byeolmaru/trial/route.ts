// app/api/byeolmaru/trial/route.ts — 3일 무료 체험 시작(1회성).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { startTrial } from "@/lib/byeolmaru/entitlement";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const r = await startTrial(userId);
  return NextResponse.json({ ok: true, ...r });
}
