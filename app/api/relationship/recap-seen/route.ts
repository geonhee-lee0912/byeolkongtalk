// app/api/relationship/recap-seen/route.ts — 복귀 인사 버블 소진(1회).
// ThreadChat이 버블을 렌더한 뒤 fire-and-forget으로 호출 → pending_skill_recap 제거.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import type { RelationshipMemo } from "@/lib/relationship/types";

export const dynamic = "force-dynamic";

export async function POST() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, memo")
    .eq("user_id", userId)
    .maybeSingle();
  if (!rel) return NextResponse.json({ ok: true });

  const memo = (rel.memo ?? {}) as RelationshipMemo;
  if (memo.pending_skill_recap) {
    memo.pending_skill_recap = null;
    await supabase.from("relationships").update({ memo }).eq("id", rel.id);
  }
  return NextResponse.json({ ok: true });
}
