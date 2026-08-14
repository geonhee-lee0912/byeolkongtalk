// lib/relationship/sim-funding.ts — 판 자금원 DB 조회 공용 헬퍼. 세션 생성(POST /sim)·쿼트(GET /sim/quote)
// 양쪽이 동일 쿼리를 쓰도록 단일화(드리프트 방지 — slot-gate 재발 방지, 메모리 relationship-slot-gate-drift-fix 참고).
// 순수 함수 resolveFunding 은 sim.ts 에 그대로 둔다(이 파일은 DB I/O 래퍼만).
import type { getServiceSupabase } from "@/lib/supabase";
import { SIM_HOOK_INTERVAL_DAYS } from "./types";
import { resolveFunding } from "./sim";

/** 이 관계의 런웨이 소진 판 수 + 이 유저의 최근 훅 판 이력을 조회해 resolveFunding 에 넘긴다.
 *  weeklyAvailable = 주간 무료(유저별)가 지금 가용한가 — 런웨이 상태와 무관하게 항상 계산(허브 배지 표기용). */
export async function determineSimFunding(
  supabase: ReturnType<typeof getServiceSupabase>,
  userId: string,
  relationshipId: string
): Promise<{ funding: "runway" | "hook" | "paid"; runwayUsed: number; weeklyAvailable: boolean }> {
  const { count: runwayUsed } = await supabase
    .from("readings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("relationship_id", relationshipId)
    .eq("consultation_type", "relationship_sim")
    .eq("saju_data->>funding", "runway");

  // 주간 무료 가용성 — 런웨이 소진 여부와 무관하게 항상 조회(표기용). 최근 hook 판이 7일 롤링 밖이면 가용.
  const { data: lastHook } = await supabase
    .from("readings")
    .select("created_at")
    .eq("user_id", userId)
    .eq("consultation_type", "relationship_sim")
    .eq("saju_data->>funding", "hook")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const hookLastAt = lastHook?.created_at ?? null;
  const now = new Date();
  const weeklyAvailable =
    !hookLastAt || (now.getTime() - new Date(hookLastAt).getTime()) / 86_400_000 >= SIM_HOOK_INTERVAL_DAYS;

  const funding = resolveFunding({ runwayUsed: runwayUsed ?? 0, hookLastAt, now });
  return { funding, runwayUsed: runwayUsed ?? 0, weeklyAvailable };
}
