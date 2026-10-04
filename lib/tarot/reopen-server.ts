// 강제 종료선 재개 — 구매 라우트(extend·clarifier)의 공용 DB 단계. 판정은 ./reopen.ts 의 tarotEndState 가 정본.
// 순서(사용자 결정 2026-10-04 ④ — 실패는 항상 돈 받기 전): loadTarotEndState → reopenTarotReading(차감 전 선점) → 슬롯 CAS → 차감.
// 선점한 뒤 CAS·차감이 실패하면 restoreTarotEnd 로 원문을 되돌린다(선점한 요청만).
import type { PostgrestError } from "@supabase/supabase-js";
import type { getServiceSupabase } from "../supabase.ts";
import { stripTrailingEnd, tarotEndState, type ReopenReadingRow } from "./reopen.ts";

export type { ReopenReadingRow };

type ServiceSupabase = ReturnType<typeof getServiceSupabase>;

/** loadTarotEndState 가 돌려주는 종료 상태 — tarotEndState() 의 반환({ ended, endedAtAbsCap })에 마지막 assistant 메시지가 붙는다 */
export interface LoadedTarotEndState {
  ended: boolean;
  endedAtAbsCap: boolean;
  lastAssistant: { id: string; content: string } | null;
}

/** 재개 판정에 쓰는 reading 컬럼 — 라우트 select 에서 빠지면 undefined 가 된다 */
const ROW_COLUMNS = ["consultation_type", "spread_type", "extra_turns", "clarifier_count"] as const;

/** ⚠️ reading 은 CAS·차감 **전에** 읽은 행이어야 한다 — 구매 반영 후 값이면 재개 자격이 조용히 꺼진다. 타로가 아니면 endedAtAbsCap=false(기존 "끝났으면 400" 그대로).
 *  반환은 판별 유니온이라 `if (error) return …` 만으로 state 가 non-null 로 좁혀진다(구조분해해도). 실패 쪽 error 는 **객체 타입**이어야 한다 —
 *  unknown 으로 두면 falsy 일 수 있어 `if (error)` 뒤에도 state 가 안 좁혀진다. */
export async function loadTarotEndState(
  supabase: ServiceSupabase,
  reading: ReopenReadingRow,
): Promise<
  | { state: LoadedTarotEndState; error: null }
  | { state: null; error: PostgrestError | Error }
> {
  // 라우트의 reading 은 untyped(any) 라 select 에서 컬럼을 빠뜨려도 타입이 못 잡는다. undefined(=select 안 함)면 '타로 아님'·'횟수 0' 으로
  // 조용히 오판정되니 조회 전에 막는다 — 라우트가 CAS·차감 전에 500. null 은 DB 값이라 정상.
  const missing = ROW_COLUMNS.filter((k) => reading[k] === undefined);
  if (missing.length > 0) {
    return { state: null, error: new Error(`reopen_row_missing_columns: ${missing.join(", ")}`) };
  }
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
    reading,
  );
  return {
    state: { ended, endedAtAbsCap, lastAssistant: rows.length > 0 ? rows[rows.length - 1] : null },
    error: null,
  };
}

/** 재개 선점 — 차감 **전에** 마지막 assistant 메시지 끝 [END] 만 떼어 대화를 다시 연다(사용자 결정 2026-10-04 ④: 실패는 항상 돈 받기 전).
 *  아직 [END] 가 남은 행만 갱신하는 CAS 라 같은 대화의 동시 구매 요청 중 하나만 선점한다 — 이미 누가 선점했으면(0행) error(reopen_claim_lost).
 *  복원은 선점한 요청만 해야 한다: 못 잡은 쪽이 원문을 되돌려 쓰면 먼저 잡은 쪽의 재개를 덮어, 돈은 냈는데 [END] 가 되살아난다.
 *  (본문 전체를 `eq` 로 비교하지 않는 건 PostgREST 쿼리스트링에 메시지 전문이 URL 인코딩돼 실려 길이 한도에 걸릴 수 있어서다.)
 *  이후 CAS·차감이 실패하면 restoreTarotEnd 로 되돌린다. */
export async function reopenTarotReading(
  supabase: ServiceSupabase,
  lastAssistant: { id: string; content: string },
): Promise<{ error: unknown }> {
  const { data, error } = await supabase
    .from("messages")
    .update({ content: stripTrailingEnd(lastAssistant.content) })
    .eq("id", lastAssistant.id)
    .like("content", "%[END]%")
    .select("id");
  if (error) return { error };
  if (!data || data.length === 0) {
    return { error: new Error(`reopen_claim_lost: ${lastAssistant.id}`) };
  }
  return { error: null };
}

/** 재개 선점 반납 — CAS·차감 실패 시 원문([END] 포함) 복원. 실패해도 최악은 무료 1턴(다음 채팅 턴이 강제 종료선이라 바로 닫힌다) */
export async function restoreTarotEnd(
  supabase: ServiceSupabase,
  lastAssistant: { id: string; content: string },
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from("messages")
    .update({ content: lastAssistant.content })
    .eq("id", lastAssistant.id);
  return { error };
}
