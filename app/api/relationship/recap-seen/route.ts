// app/api/relationship/recap-seen/route.ts — 복귀 인사 버블 확정(1회).
// ThreadChat이 복귀 인사를 띄운 뒤 호출 → 인사 말풍선을 스레드에 저장(새로고침 생존) + pending_skill_recap 제거.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildSkillRecapText } from "@/lib/relationship/skills";
import type { RelationshipMemo } from "@/lib/relationship/types";

export const dynamic = "force-dynamic";

export async function POST() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, thread_reading_id, memo")
    .eq("user_id", userId)
    .maybeSingle();
  if (!rel) return NextResponse.json({ ok: true });

  const memo = (rel.memo ?? {}) as RelationshipMemo;
  const recap = memo.pending_skill_recap;
  if (recap) {
    // 인사 말풍선을 스레드 메시지로 저장 — 새로고침해도 히스토리로 남게
    // (하루 대화 캡은 user 턴만 세므로 assistant 메시지 저장은 캡에 영향 없음)
    if (rel.thread_reading_id) {
      await supabase.from("messages").insert({
        reading_id: rel.thread_reading_id,
        role: "assistant",
        content: buildSkillRecapText(recap.skill, recap.summary),
      });
    }
    memo.pending_skill_recap = null;
    await supabase.from("relationships").update({ memo }).eq("id", rel.id);
  }
  return NextResponse.json({ ok: true });
}
