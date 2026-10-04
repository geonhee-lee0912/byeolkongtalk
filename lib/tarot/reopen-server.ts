// 강제 종료선 재개 — 구매 라우트(extend·clarifier)의 공용 DB 단계. 판정은 ./reopen.ts 의 tarotEndState 가 정본.
// 순서(사용자 결정 2026-10-04 ④ — 실패는 항상 돈 받기 전): loadTarotEndState → reopenTarotReading(차감 전 선점) → 슬롯 CAS → 차감.
// 선점한 뒤 CAS·차감이 실패하면 restoreTarotEnd 로 원문을 되돌린다(선점한 요청만).
import type { PostgrestError } from "@supabase/supabase-js";
import type { getServiceSupabase } from "../supabase.ts";
import type { logError } from "../logger.ts";
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

/** 재개 선점 결과 — 판별 유니온. 0행(동시 요청이 먼저 선점)과 DB 오류를 에러 문자열이 아니라 타입으로 가른다 */
export type ReopenResult =
  | { ok: true }
  | { ok: false; reason: "claim_lost" }
  | { ok: false; reason: "db_error"; error: unknown };

/** 재개 선점 — 차감 **전에** 마지막 assistant 메시지 끝 [END] 만 떼어 대화를 다시 연다(사용자 결정 2026-10-04 ④: 실패는 항상 돈 받기 전).
 *  아직 [END] 가 남은 행만 갱신하는 CAS 라 같은 대화의 동시 구매 요청 중 하나만 선점한다 — 이미 누가 선점했으면(0행) claim_lost.
 *  복원은 선점한 요청만 해야 한다: 못 잡은 쪽이 원문을 되돌려 쓰면 먼저 잡은 쪽의 재개를 덮어, 돈은 냈는데 [END] 가 되살아난다.
 *  (본문 전체를 `eq` 로 비교하지 않는 건 PostgREST 쿼리스트링에 메시지 전문이 URL 인코딩돼 실려 길이 한도에 걸릴 수 있어서다.)
 *  이후 CAS·차감이 실패하면 restoreTarotEnd 로 되돌린다. */
export async function reopenTarotReading(
  supabase: ServiceSupabase,
  lastAssistant: { id: string; content: string },
): Promise<ReopenResult> {
  const { data, error } = await supabase
    .from("messages")
    .update({ content: stripTrailingEnd(lastAssistant.content) })
    .eq("id", lastAssistant.id)
    .like("content", "%[END]%")
    .select("id");
  if (error) return { ok: false, reason: "db_error", error };
  if (!data || data.length === 0) return { ok: false, reason: "claim_lost" };
  return { ok: true };
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

/** claim/restore 가 로그를 남길 때 쓰는 맥락 — 라우트마다 달라서 받는다. logError 를 주입받아 이 모듈이 로거에 묶이지 않는다(테스트에서 가짜를 넣는다) */
export interface ReopenLog {
  /** console.error 접두 — "[extend]" · "[clarifier]" */
  tag: string;
  route: string;
  userId: string;
  readingId: string;
  logError: typeof logError;
}

/** claimTarotReopen 결과 — 선점 못 함(claim_lost·db_error)이거나, 성공(재개할 게 없었으면 reopened=null · restore 는 아무것도 안 한다) */
export type ReopenClaim =
  | { ok: true; reopened: { id: string; content: string } | null; restore: () => Promise<void> }
  | { ok: false; reason: "claim_lost" }
  | { ok: false; reason: "db_error"; error: unknown };

/** 구매 라우트 공용 — 강제 종료선에서 닫힌 타로 대화면 [END] 를 선점(차감 전)하고, CAS·차감 실패 때 부를 restore 를 돌려준다.
 *  선점할 게 없으면(강제 종료선이 아니거나 사주) ok:true · reopened:null · restore 는 no-op. 선점 실패는 여기서 로그까지 남기고 사유만 돌려준다. */
export async function claimTarotReopen(
  supabase: ServiceSupabase,
  endState: LoadedTarotEndState,
  log: ReopenLog,
): Promise<ReopenClaim> {
  const target = endState.endedAtAbsCap ? endState.lastAssistant : null;
  if (!target) return { ok: true, reopened: null, restore: async () => {} };

  const r = await reopenTarotReading(supabase, target);
  if (!r.ok) {
    await log.logError(r.reason === "db_error" ? r.error : new Error(`reopen_claim_lost: ${target.id}`), {
      route: log.route,
      userId: log.userId,
      extra: { stage: "reopen", readingId: log.readingId },
    });
    return r;
  }

  // 선점한 [END] 제거를 원문으로 되돌린다 — 이후 CAS·차감이 실패했을 때만 부른다.
  const restore = async () => {
    const { error } = await restoreTarotEnd(supabase, target);
    if (!error) return;
    console.error(`${log.tag} 재개 선점 복원 실패 — 수동 보정 필요:`, {
      readingId: log.readingId,
      userId: log.userId,
      messageId: target.id,
    });
    await log.logError(error, {
      route: log.route,
      userId: log.userId,
      extra: { stage: "reopen_restore", readingId: log.readingId, messageId: target.id },
    });
  };
  return { ok: true, reopened: target, restore };
}
