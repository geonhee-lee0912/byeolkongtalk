// app/api/admin/seen/route.ts — 대시보드 [확인했어요]: "어디까지 봤나" 마커를 앞으로만 민다.
// until = 화면에 보였던 마지막 항목의 created_at (누른 시각 아님 — 보는 사이 들어온 항목 보존).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";
import { parseSeenUntil } from "@/lib/admin/daily";

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
  // 받은 문자열을 그대로 쓴다 — Date 로 왕복하면 마이크로초가 잘려 최신 응답이 계속 "새 것"으로 남는다.
  const until = parseSeenUntil(b.until, new Date());
  if (!until) {
    return NextResponse.json({ error: "until 이 잘못됐어요" }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const row = { seen_until: until, updated_by: gate.userId, updated_at: new Date().toISOString() };
  // 앞으로만 민다(원자적) — `seen_until < until` 조건부 UPDATE 한 방이라 두 기기가 동시에 눌러도
  // 늦게 도착한 쪽이 기준선을 되돌리지 못한다. 0행이면 행이 없거나 이미 ≥ 인 것.
  const upd = await supa.from("admin_seen_markers").update(row).eq("key", b.key).lt("seen_until", until).select("key");
  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  if (!upd.data || upd.data.length === 0) {
    const ins = await supa.from("admin_seen_markers").insert({ key: b.key, ...row });
    if (ins.error) {
      // 23505 = 이미 행이 있다(누군가 ≥ 값을 가짐 · 동시 삽입) → 변경 없음
      if (ins.error.code === "23505") return NextResponse.json({ ok: true, unchanged: true });
      return NextResponse.json({ error: ins.error.message }, { status: 500 });
    }
  }

  await logAdminAction({
    adminId: gate.userId, action: "seen_mark", targetType: "admin_seen_markers", targetId: b.key,
    payload: { until },
  });
  return NextResponse.json({ ok: true });
}
