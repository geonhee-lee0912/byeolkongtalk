// app/api/admin/seen/route.ts — 대시보드 [확인했어요]: "어디까지 봤나" 마커를 앞으로만 민다.
// until = 화면에 보였던 마지막 항목의 created_at (누른 시각 아님 — 보는 사이 들어온 항목 보존).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = new Set(["survey"]);

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const b = ((await req.json().catch(() => null)) ?? {}) as { key?: unknown; until?: unknown };
  if (typeof b.key !== "string" || !KEYS.has(b.key)) {
    return NextResponse.json({ error: "알 수 없는 key" }, { status: 400 });
  }
  const t = typeof b.until === "string" ? Date.parse(b.until) : NaN;
  if (!Number.isFinite(t) || t > Date.now() + 60_000) {
    return NextResponse.json({ error: "until 이 잘못됐어요" }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const { data: cur, error: readErr } = await supa
    .from("admin_seen_markers").select("seen_until").eq("key", b.key).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  // 앞으로만 민다 — 두 기기에서 늦게 누른 쪽이 기준선을 되돌리지 않게.
  if (cur && Date.parse(cur.seen_until) >= t) return NextResponse.json({ ok: true, unchanged: true });

  const until = new Date(t).toISOString();
  const { error } = await supa.from("admin_seen_markers").upsert({
    key: b.key, seen_until: until, updated_by: gate.userId, updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    adminId: gate.userId, action: "seen_mark", targetType: "admin_seen_markers", targetId: b.key,
    payload: { until },
  });
  return NextResponse.json({ ok: true });
}
