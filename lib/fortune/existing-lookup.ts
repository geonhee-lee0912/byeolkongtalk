// 이미 본 동일 사주 상품(같은 user·emotion_tag·프로필) 리딩을 찾아 재과금·중복생성을 막는다.
// daily(하루)·monthly(월)·tarot(매 뽑기 상이)는 대상 아님 — 호출측에서 제외한다.
import { getServiceSupabase } from "@/lib/supabase";

export interface ExistingSig {
  emotionTag: string;
  /** 단일 프로필 상품(saju_full·good_days·신규 15종) */
  profileId?: string | null;
  /** 궁합(compat·compat_social) — 두 프로필, 순서 무관 */
  compatPair?: { aId: string; bId: string };
}

interface Row {
  id: string;
  profile_id: string | null;
  saju_data: unknown;
  created_at: string;
}

function sajuIds(saju_data: unknown): { aId?: string; bId?: string } {
  if (!saju_data || typeof saju_data !== "object") return {};
  const d = saju_data as Record<string, unknown>;
  return {
    aId: typeof d.aId === "string" ? d.aId : undefined,
    bId: typeof d.bId === "string" ? d.bId : undefined,
  };
}

/** rows(최신순)에서 시그니처와 일치하는 첫 리딩 id. 순수 함수 — 테스트 대상. */
export function pickExistingReadingId(rows: Row[], sig: ExistingSig): string | null {
  for (const row of rows) {
    if (sig.compatPair) {
      const { aId, bId } = sajuIds(row.saju_data);
      if (!aId || !bId) continue;
      const pair = new Set([aId, bId]);
      if (pair.size === 2 && pair.has(sig.compatPair.aId) && pair.has(sig.compatPair.bId)) {
        return row.id;
      }
    } else if (sig.profileId != null) {
      if (row.profile_id === sig.profileId) return row.id;
    }
  }
  return null;
}

/** 같은 emotion_tag 리딩을 최신순으로 받아 시그니처 일치분을 찾는다. 없으면 null. */
export async function findExistingFortuneReadingId(
  userId: string,
  sig: ExistingSig
): Promise<string | null> {
  const { data } = await getServiceSupabase()
    .from("readings")
    .select("id, profile_id, saju_data, created_at")
    .eq("user_id", userId)
    .eq("emotion_tag", sig.emotionTag)
    .order("created_at", { ascending: false })
    .limit(50);
  return pickExistingReadingId((data ?? []) as Row[], sig);
}
