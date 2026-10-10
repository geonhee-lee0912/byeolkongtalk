// app/api/cron/ad-spend-sync/route.ts — Vercel Cron (매일 05:00 KST, vercel.json).
// Vercel 이 `Authorization: Bearer ${CRON_SECRET}` 를 붙여 부른다. 시크릿이 없으면 무조건 거부.
// Vercel Cron 은 production 배포에서만 돈다 — dev 는 /admin/ads 버튼으로 실행.
import { NextRequest, NextResponse } from "next/server";
import { recentRange, syncAdSpend } from "@/lib/ads/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { from, to } = recentRange();
  const r = await syncAdSpend({ from, to, trigger: "cron", adminId: null });
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
