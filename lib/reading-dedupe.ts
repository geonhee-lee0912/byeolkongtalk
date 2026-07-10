// 리딩 생성 중복 방지 (Option B) — 서버 전용 방어층.
// 동일 유저가 짧은 시간창(WINDOW_MS) 안에 '동일 시그니처' 리딩을 다시 생성하려 하면
// (더블클릭·재시도·remount 등) 새로 만들지 않고 기존 리딩을 반환 → 별 중복 차감 원천 차단.
//
// 감지 겸용: 차단이 발동하면 logWarn 로 DUPLICATE_READING_BLOCKED 신호를 남긴다.
// → /admin/errors 에서 유저 신고 없이 중복 시도 빈도를 모니터링할 수 있다.

import { getServiceSupabase } from "@/lib/supabase";
import { logWarn } from "@/lib/logger";

const WINDOW_MS = 60_000;

export interface ReadingSignature {
  /** 제공된 필드만 비교 (undefined 는 스킵). null 은 'null 과 일치' 비교. */
  consultationType?: string;
  emotionTag?: string | null;
  question?: string;
  spreadType?: string | null;
  sajuProduct?: string | null;
  profileId?: string | null;
  drawnCards?: { position: number; card_id: number; direction: string }[] | null;
}

function normDrawn(d: unknown): string {
  if (!Array.isArray(d)) return "";
  return d
    .map((c) => {
      const cc = (c ?? {}) as Record<string, unknown>;
      return `${cc.position}:${cc.card_id}:${cc.direction}`;
    })
    .join("|");
}

type ReadingRow = {
  id: string;
  stars_spent: number | null;
  consultation_type: string | null;
  emotion_tag: string | null;
  question: string | null;
  spread_type: string | null;
  saju_product: string | null;
  profile_id: string | null;
  drawn_cards: unknown;
};

function matches(row: ReadingRow, sig: ReadingSignature): boolean {
  if (sig.consultationType !== undefined && row.consultation_type !== sig.consultationType)
    return false;
  if (sig.emotionTag !== undefined && (row.emotion_tag ?? null) !== (sig.emotionTag ?? null))
    return false;
  if (sig.question !== undefined && row.question !== sig.question) return false;
  if (sig.spreadType !== undefined && (row.spread_type ?? null) !== (sig.spreadType ?? null))
    return false;
  if (sig.sajuProduct !== undefined && (row.saju_product ?? null) !== (sig.sajuProduct ?? null))
    return false;
  if (sig.profileId !== undefined && (row.profile_id ?? null) !== (sig.profileId ?? null))
    return false;
  if (sig.drawnCards !== undefined && normDrawn(row.drawn_cards) !== normDrawn(sig.drawnCards))
    return false;
  return true;
}

/**
 * 최근 WINDOW_MS 내 동일 시그니처 리딩이 있으면 반환 (차감·생성 없이 재사용).
 * 없으면 null. 차단 발동 시 warn 로그로 감지 신호를 남긴다.
 */
export async function findRecentDuplicateReading(
  userId: string,
  sig: ReadingSignature,
  route: string
): Promise<{ id: string; starsSpent: number } | null> {
  const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("readings")
    .select(
      "id, stars_spent, consultation_type, emotion_tag, question, spread_type, saju_product, profile_id, drawn_cards"
    )
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const row of (data ?? []) as ReadingRow[]) {
    if (matches(row, sig)) {
      await logWarn(`중복 리딩 생성 차단 (${route})`, {
        route,
        userId,
        extra: {
          severity: "DUPLICATE_READING_BLOCKED",
          existingReadingId: row.id,
          consultationType: sig.consultationType ?? row.consultation_type,
          emotionTag: sig.emotionTag ?? row.emotion_tag,
        },
      });
      return { id: row.id, starsSpent: row.stars_spent ?? 0 };
    }
  }
  return null;
}
