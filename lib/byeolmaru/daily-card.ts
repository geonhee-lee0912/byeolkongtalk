// lib/byeolmaru/daily-card.ts — 그날의 카드 조회(날짜 지정 가능) / 오늘의 카드 기록(오늘 전용) (DB 래퍼).
import { getServiceSupabase } from "@/lib/supabase";
import { getCardCount } from "@/lib/tarot/cards";

export interface DailyCard { cardId: number; reversed: boolean; }

export function isValidCardId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && id < getCardCount();
}

/** 그날의 카드 조회. 하루 1장이라 (유저,날짜)가 곧 키다. 지난 날짜도 그대로 조회된다. */
export async function getCardOn(userId: string, dateKst: string): Promise<DailyCard | null> {
  const { data } = await getServiceSupabase()
    .from("byeolmaru_daily_card")
    .select("card_id, reversed")
    .eq("user_id", userId).eq("card_date", dateKst).maybeSingle();
  return data ? { cardId: data.card_id, reversed: data.reversed } : null;
}

/** 하루 1장 멱등 기록 — 이미 오늘 카드가 있으면 그걸 반환(덮어쓰기 금지 = 재뽑기 방지).
 *  ⚠️ todayKst 는 반드시 **오늘**이어야 한다 — 과거·미래 백필 금지. 타입으로 못 막으니 호출부가 보장한다
 *     (조회 getCardOn 은 날짜 자유, 기록은 오늘 고정 — 이 비대칭이 의도된 것이다). */
export async function recordDraw(userId: string, todayKst: string, cardId: number, reversed: boolean): Promise<DailyCard> {
  const existing = await getCardOn(userId, todayKst);
  if (existing) return existing;
  const { error } = await getServiceSupabase()
    .from("byeolmaru_daily_card")
    .insert({ user_id: userId, card_date: todayKst, card_id: cardId, reversed });
  if (error) { const again = await getCardOn(userId, todayKst); if (again) return again; throw error; }
  return { cardId, reversed };
}
