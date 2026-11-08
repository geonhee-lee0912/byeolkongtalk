// Vercel Cron (15분마다, vercel.json) — 오늘 보낼 '다시 볼 날' 알림, 그 뒤 2년 재확인 통지를 보낸다.
// Vercel 이 `Authorization: Bearer ${CRON_SECRET}` 를 붙여 부른다. 시크릿이 없으면 무조건 거부.
// Vercel Cron 은 production 배포에서만 돈다 — dev 는 손으로 호출한다.
import { NextRequest, NextResponse } from "next/server";
import { dispatchRevisits } from "@/lib/push/dispatch";
import { getReceipts, sendExpo } from "@/lib/push/expo";
import { supabaseDispatchStore, supabaseReconfirmStore } from "@/lib/push/store";
import { reconfirmJob } from "@/lib/push/reconfirm-job";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await dispatchRevisits(
    new Date(),
    supabaseDispatchStore,
    { send: (m) => sendExpo(m), receipts: (ids) => getReceipts(ids) },
    logError,
    { jobs: [reconfirmJob(supabaseReconfirmStore)] },
  );
  return NextResponse.json(r);
}
