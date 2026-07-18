// lib/relationship/skill-log.ts — 스킬 완료 결과를 관계 memo.skill_log 에 적립 (별콩이 기억용).
// 스킬 reading([END]/리포트 완료) 시 호출 → 이후 스레드에서 별콩이가 "저번에 궁합 봤을 때~" 참조.
import { getServiceSupabase } from "@/lib/supabase";
import type { RelationshipMemo } from "./types";

export async function logSkillToThread(
  relationshipId: string,
  skillKey: string,
  readingId: string,
  summary: string
): Promise<void> {
  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select("memo")
    .eq("id", relationshipId)
    .maybeSingle();
  if (!rel) return;
  const memo = (rel.memo ?? {}) as RelationshipMemo;
  memo.skill_log = [
    ...(memo.skill_log ?? []),
    {
      skill: skillKey,
      reading_id: readingId,
      summary: summary.replace(/\s+/g, " ").trim().slice(0, 120),
      created_at: new Date().toISOString(),
    },
  ].slice(-20); // 최근 20개만 유지
  await supabase.from("relationships").update({ memo }).eq("id", relationshipId);
}
