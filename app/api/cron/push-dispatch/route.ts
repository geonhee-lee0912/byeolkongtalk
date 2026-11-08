// Vercel Cron (15분마다, vercel.json) — 다시 볼 날, 2년 재확인 통지, 아침 별 흐름, 깨우기·이어가기를 보낸다.
// Vercel 이 `Authorization: Bearer ${CRON_SECRET}` 를 붙여 부른다. 시크릿이 없으면 무조건 거부.
// Vercel Cron 은 production 배포에서만 돈다 — dev 는 손으로 호출한다.
import { NextRequest, NextResponse } from "next/server";
import { dispatchRevisits } from "@/lib/push/dispatch";
import { getReceipts, sendExpo } from "@/lib/push/expo";
import { supabaseDispatchStore, supabaseFactsStore, supabaseReconfirmStore, supabaseResumeStore } from "@/lib/push/store";
import { comebackJob } from "@/lib/push/comeback-job";
import { reconfirmJob } from "@/lib/push/reconfirm-job";
import { morningJob } from "@/lib/push/morning-job";
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
    // 순서: 다시 볼 날(위) → 2년 재확인 → 아침 별 흐름(08:30~11:00) → 깨우기(아침)·이어가기(19:00~20:30).
    // 아침 흐름이 깨우기보다 먼저 — 같은 아침 칸이라 아침 흐름을 받은 회원은 깨우기가 빈도로 걸러진다
    { jobs: [reconfirmJob(supabaseReconfirmStore), morningJob(supabaseFactsStore), comebackJob(supabaseFactsStore, supabaseResumeStore)] },
  );
  return NextResponse.json(r);
}
