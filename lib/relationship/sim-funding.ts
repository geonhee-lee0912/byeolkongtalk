// lib/relationship/sim-funding.ts — 판 자금원 DB 조회 공용 헬퍼. 세션 생성(POST /sim)·쿼트(GET /sim/quote)
// 양쪽이 동일 쿼리를 쓰도록 단일화(드리프트 방지 — slot-gate 재발 방지, 메모리 relationship-slot-gate-drift-fix 참고).
// 순수 함수 resolveFunding 은 sim.ts 에 그대로 둔다(이 파일은 DB I/O 래퍼만).
import type { getServiceSupabase } from "@/lib/supabase";
import { SIM_FREE_RUNWAY } from "./types";
import { resolveFunding } from "./sim";

/** 이 관계의 런웨이 소진 판 수 + 이 유저의 최근 훅 판 이력을 조회해 resolveFunding 에 넘긴다. */
export async function determineSimFunding(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string,
  relationshipId: string
): Promise<{ funding: "runway" | "hook" | "paid"; runwayUsed: number }> {
  const { count: runwayUsed } = await supabase
    .from("readings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("relationship_id", relationshipId)
    .eq("consultation_type", "relationship_sim")
    .eq("saju_data->>funding", "runway");

  let hookLastAt: string | null = null;
  if ((runwayUsed ?? 0) >= SIM_FREE_RUNWAY) {
    const { data: lastHook } = await supabase
      .from("readings")
      .select("created_at")
      .eq("user_id", userId)
      .eq("consultation_type", "relationship_sim")
      .eq("saju_data->>funding", "hook")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    hookLastAt = lastHook?.created_at ?? null;
  }

  const funding = resolveFunding({ runwayUsed: runwayUsed ?? 0, hookLastAt, now: new Date() });
  return { funding, runwayUsed: runwayUsed ?? 0 };
}
