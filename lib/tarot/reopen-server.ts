// 강제 종료선 재개 — 구매 라우트(extend·clarifier)의 공용 DB 단계. 판정은 ./reopen.ts 의 tarotEndState 가 정본.
import type { getServiceSupabase } from "../supabase.ts";
import { stripTrailingEnd, tarotEndState } from "./reopen.ts";

type ServiceSupabase = ReturnType<typeof getServiceSupabase>;

export interface TarotEndState {
  ended: boolean;
  endedAtAbsCap: boolean;
  lastAssistant: { id: string; content: string } | null;
}

export interface ReopenReadingRow {
  id: string;
  consultation_type: string | null;
  spread_type: string | null;
  extra_turns: number | null;
  clarifier_count: number | null;
}

/** ⚠️ reading 은 CAS·차감 **전에** 읽은 행이어야 한다 — 구매 반영 후 값이면 재개 자격이 조용히 꺼진다. 타로가 아니면 endedAtAbsCap=false(기존 "끝났으면 400" 그대로) */
export async function loadTarotEndState(
  supabase: ServiceSupabase,
  reading: ReopenReadingRow,
): Promise<{ state: TarotEndState | null; error: unknown }> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, content")
    .eq("reading_id", reading.id)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });
  // 조회 실패를 '안 끝남'으로 삼키면 게이트가 열린 채 CAS·차감까지 간다 — 라우트가 그 전에 500 으로 끊도록 돌려준다
  if (error) return { state: null, error };
  const rows = (data ?? []) as { id: string; content: string }[];
  const { ended, endedAtAbsCap } = tarotEndState(
    rows.map((m) => m.content),
    reading.consultation_type === "tarot" ? reading.spread_type : null,
    reading.extra_turns ?? 0,
    reading.clarifier_count ?? 0,
  );
  return {
    state: { ended, endedAtAbsCap, lastAssistant: rows.length > 0 ? rows[rows.length - 1] : null },
    error: null,
  };
}

/** 구매 성공 뒤 — 마지막 assistant 메시지 끝 [END] 만 떼어 대화를 다시 연다 */
export async function reopenTarotReading(
  supabase: ServiceSupabase,
  lastAssistant: { id: string; content: string },
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from("messages")
    .update({ content: stripTrailingEnd(lastAssistant.content) })
    .eq("id", lastAssistant.id);
  return { error };
}
