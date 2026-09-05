// lib/byeolmaru/daily-card.ts — 오늘의 카드 조회/기록 (DB 래퍼).
import { getServiceSupabase } from "@/lib/supabase";
import { getCardCount } from "@/lib/tarot/cards";

export interface DailyCard { cardId: number; reversed: boolean; }

export function isValidCardId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && id < getCardCount();
}

export async function getTodayCard(userId: string, todayKst: string): Promise<DailyCard | null> {
  const { data } = await getServiceSupabase()
    .from("byeolmaru_daily_card")
    .select("card_id, reversed")
    .eq("user_id", userId).eq("card_date", todayKst).maybeSingle();
  return data ? { cardId: data.card_id, reversed: data.reversed } : null;
}

/** 하루 1장 멱등 기록 — 이미 오늘 카드가 있으면 그걸 반환(덮어쓰기 금지 = 재뽑기 방지). */
export async function recordDraw(userId: string, todayKst: string, cardId: number, reversed: boolean): Promise<DailyCard> {
  const existing = await getTodayCard(userId, todayKst);
  if (existing) return existing;
  const { error } = await getServiceSupabase()
    .from("byeolmaru_daily_card")
    .insert({ user_id: userId, card_date: todayKst, card_id: cardId, reversed });
  if (error) { const again = await getTodayCard(userId, todayKst); if (again) return again; throw error; }
  return { cardId, reversed };
}
