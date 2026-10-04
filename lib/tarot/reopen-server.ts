// 강제 종료선 재개 — 구매 라우트(extend·clarifier)의 공용 DB 단계. 판정은 ./reopen.ts 가 정본.
import type { getServiceSupabase } from "../supabase.ts";
import { effectiveAbsTurnCap, isEndedAtAbsCap, stripTrailingEnd } from "./reopen.ts";

type SupabaseClient = ReturnType<typeof getServiceSupabase>;

export interface TarotEndState {
  ended: boolean;
  endedAtAbsCap: boolean;
  lastAssistant: { id: string; content: string } | null;
}

/** spreadType=null(타로 아님)이면 endedAtAbsCap 은 항상 false — 기존 "끝났으면 400" 그대로 */
export async function loadTarotEndState(
  supabase: SupabaseClient,
  readingId: string,
  spreadType: string | null,
  extraTurns: number,
  clarifierCount: number,
): Promise<TarotEndState> {
  const { data } = await supabase
    .from("messages")
    .select("id, content")
    .eq("reading_id", readingId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as { id: string; content: string }[];
  const ended = rows.some((m) => m.content.includes("[END]"));
  const endedAtAbsCap =
    spreadType != null &&
    isEndedAtAbsCap({
      ended,
      assistantTurns: rows.length,
      effAbsTurnCap: effectiveAbsTurnCap(spreadType, extraTurns, clarifierCount),
    });
  return { ended, endedAtAbsCap, lastAssistant: rows.length > 0 ? rows[rows.length - 1] : null };
}

/** 구매 성공 뒤 — 마지막 assistant 메시지 끝 [END] 만 떼어 대화를 다시 연다 */
export async function reopenTarotReading(
  supabase: SupabaseClient,
  lastAssistant: { id: string; content: string },
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from("messages")
    .update({ content: stripTrailingEnd(lastAssistant.content) })
    .eq("id", lastAssistant.id);
  return { error };
}
