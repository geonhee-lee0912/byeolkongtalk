// app/api/cron/ad-spend-sync/route.ts — Vercel Cron (매시 정각, vercel.json).
// 하루 1회가 아니라 매시인 이유: 1층 7일 기여에 진행 중인 오늘이 들어간다. 05:00 한 번이면 오늘 광고비가
// 하루 종일 0~5시 분량으로 멈춰 기여가 부풀고, 오늘 행이 있어 지연 경고(adRows=0)도 꺼진다.
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
