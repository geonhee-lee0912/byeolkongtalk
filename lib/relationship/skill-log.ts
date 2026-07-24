// lib/relationship/skill-log.ts — 스킬 완료 결과를 관계 memo에 적립.
// skill_log(별콩이 기억) + pending_skill_recap(복귀 시 스레드 인사 버블) 을 함께 세팅.
// 스킬 reading([END]/리포트 완료) 시 호출 → 이후 스레드에서 별콩이가 "저번에 궁합 봤을 때~" 참조.
import { getServiceSupabase } from "@/lib/supabase";
import { applySkillToMemo } from "./memory";
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
  const memo = applySkillToMemo(
    (rel.memo ?? {}) as RelationshipMemo,
    skillKey,
    readingId,
    summary,
    new Date().toISOString()
  );
  await supabase.from("relationships").update({ memo }).eq("id", relationshipId);
}
