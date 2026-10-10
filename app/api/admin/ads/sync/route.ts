// app/api/admin/ads/sync/route.ts — "지금 동기화"(본문 없음 = 최근 8일) / "기간 재수집"({from,to}).
import { NextRequest, NextResponse } from "next/server";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";
import { MAX_RANGE_DAYS, recentRange, syncAdSpend } from "@/lib/ads/sync";
import { datesInRange, kstToday } from "@/lib/ads/meta-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const b = (await req.json().catch(() => ({}))) as { from?: unknown; to?: unknown };
  const isRange = b.from != null || b.to != null;
  let from: string;
  let to: string;
  if (isRange) {
    if (typeof b.from !== "string" || typeof b.to !== "string" || !DATE_RE.test(b.from) || !DATE_RE.test(b.to)) {
      return NextResponse.json({ error: "날짜 형식은 YYYY-MM-DD 예요." }, { status: 400 });
    }
    if (b.from > b.to) return NextResponse.json({ error: "시작일이 종료일보다 늦어요." }, { status: 400 });
    if (b.to > kstToday()) return NextResponse.json({ error: "종료일이 오늘(KST)보다 늦어요." }, { status: 400 });
    let dayCount: number;
    try {
      dayCount = datesInRange(b.from, b.to).length;
    } catch {
      return NextResponse.json({ error: "존재하지 않는 날짜예요." }, { status: 400 });
    }
    if (dayCount > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `한 번에 ${MAX_RANGE_DAYS}일까지만 돼요.` }, { status: 400 });
    }
    from = b.from;
    to = b.to;
  } else {
    ({ from, to } = recentRange());
  }

  const trigger = isRange ? "range" : "manual";
  const r = await syncAdSpend({ from, to, trigger, adminId: gate.userId });
  await logAdminAction({
    adminId: gate.userId,
    action: "ad_spend_sync",
    targetType: "ad_spend",
    targetId: null,
    payload: { trigger, from, to, ok: r.ok, ...(r.ok ? { rows: r.rows } : { error: r.error }) },
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
