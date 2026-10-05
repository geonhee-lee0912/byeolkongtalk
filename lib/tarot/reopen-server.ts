// 강제 종료선 재개 — 구매 라우트(extend·clarifier)의 공용 DB 단계. 판정은 ./reopen.ts 의 tarotEndState 가 정본.
// 순서(사용자 결정 2026-10-04 ④ — 실패는 항상 돈 받기 전, 결과가 불명하면 사용자에게 유리한 쪽):
//   loadTarotEndState → claimInProgress 면 409 → 한도·잔액 사전 확인 → claimTarotReopen(차감 전 [END] 선점) → 슬롯 CAS(두 카운터) → 차감.
// 실패 처리: 슬롯 CAS 0행(읽은 뒤 행이 바뀐 동시 경합 — 한도는 사전 확인이 이미 걸렀다)이면 claim.restore 후 409.
// 차감이 확정 부족(insufficient)이면 undoSlotAndRestore(반납 CAS 가 깨끗할 때만 복원) 후 402.
// 결과 불명은 되돌리지 않는다 — 슬롯 CAS 오류는 열어 둔 채 500(적용됐을 수 있고, 올라간 선 아래에서 [END] 만 되살리면 영영 재개할 수 없다).
// 차감 rpc_error 는 성공으로 처리한다(커밋됐을 수 있고 효과는 이미 적용돼 있다 — 라우트가 spend_unknown_granted ERROR 로그로 star_transactions 대조 표시를 남긴다).
// 복원은 선점한 요청만 한다.
import type { PostgrestError } from "@supabase/supabase-js";
import type { getServiceSupabase } from "../supabase.ts";
import type { logError, logWarn } from "../logger.ts";
import { stripTrailingEnd, tarotEndState, type ReopenReadingRow } from "./reopen.ts";
import type { DrawnCard } from "./spreads.ts";

type ServiceSupabase = ReturnType<typeof getServiceSupabase>;

/** loadTarotEndState 가 돌려주는 종료 상태 — tarotEndState() 의 반환({ ended, endedAtAbsCap, claimInProgress })에 마지막 assistant 메시지가 붙는다 */
export interface LoadedTarotEndState {
  ended: boolean;
  endedAtAbsCap: boolean;
  /** 열려 있는데 턴 수 ≥ 유효 강제 종료선 — 다른 구매가 [END] 를 선점해 진행 중이다. 구매 라우트는 409(purchase_in_progress) */
  claimInProgress: boolean;
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
  const { ended, endedAtAbsCap, claimInProgress } = tarotEndState(
    rows.map((m) => m.content),
    reading,
  );
  return {
    state: { ended, endedAtAbsCap, claimInProgress, lastAssistant: rows.length > 0 ? rows[rows.length - 1] : null },
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

/** 재개 선점 반납 — CAS·차감 실패 시 원문([END] 포함) 복원. 실패해도 최악은 무료 1턴이다: [END] 는 UI·구매 마커일 뿐 비용 잠금이 아니다 —
 *  채팅 라우트는 [END] 뒤에 온 메시지도 서버에서 막지 않고, 강제 종료선 턴이면 그냥 마무리 답을 내고 다시 닫는다. */
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

/** claim/restore/rollback 이 로그를 남길 때 쓰는 맥락 — 라우트마다 달라서 받는다. logError·logWarn 을 주입받아 이 모듈이 로거에 묶이지 않는다(테스트에서 가짜를 넣는다) */
export interface ReopenLog {
  /** console.error 접두 — "[extend]" · "[clarifier]" */
  tag: string;
  route: string;
  userId: string;
  /** 로그 맥락용(표시용) — DB 키가 아니다. 반납 CAS 의 키는 SlotUndo.readingId */
  readingId: string;
  logError: typeof logError;
  logWarn: typeof logWarn;
}

/** claimTarotReopen 결과 — 선점 못 함(claim_lost·db_error)이거나, 성공(재개할 게 없었으면 reopened=null · restore 는 아무것도 안 한다) */
export type ReopenClaim =
  | { ok: true; reopened: { id: string; content: string } | null; restore: () => Promise<void> }
  | { ok: false; reason: "claim_lost" }
  | { ok: false; reason: "db_error"; error: unknown };

/** 구매 라우트 공용 — 강제 종료선에서 닫힌 타로 대화면 [END] 를 선점(차감 전)하고, CAS·차감 실패 때 부를 restore 를 돌려준다.
 *  선점할 게 없으면(강제 종료선이 아니거나 사주) ok:true · reopened:null · restore 는 no-op. 선점 실패는 여기서 로그까지 남기고 사유만 돌려준다:
 *  claim_lost 는 더블탭에서 진 쪽 같은 설계된 정상 신호라 WARN(라우트는 409), db_error 만 ERROR(라우트는 500). */
export async function claimTarotReopen(
  supabase: ServiceSupabase,
  endState: LoadedTarotEndState,
  log: ReopenLog,
): Promise<ReopenClaim> {
  const target = endState.endedAtAbsCap ? endState.lastAssistant : null;
  if (!target) return { ok: true, reopened: null, restore: async () => {} };

  const r = await reopenTarotReading(supabase, target);
  if (!r.ok) {
    const ctx = { route: log.route, userId: log.userId, extra: { stage: "reopen", readingId: log.readingId } };
    if (r.reason === "claim_lost") {
      await log.logWarn(`reopen_claim_lost: 다른 구매 요청이 먼저 [END] 를 선점했다(동시 구매) — message ${target.id}`, ctx);
    } else {
      await log.logError(r.error, ctx);
    }
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

export type SlotColumn = "extra_turns" | "clarifier_count";

/** 차감이 확정 부족으로 실패한 뒤 슬롯 반납에 필요한 값 */
export interface SlotUndo {
  /** 반납 CAS 가 갱신할 readings 행 id — DB 키다. 로그용 log.readingId 와 일부러 분리했다(표시용 id 가 나중에 생겨도 반납이 조용히 'stacked' 로 바뀌지 않게) */
  readingId: string;
  /** 이 요청의 CAS 가 올린 카운터 */
  column: SlotColumn;
  /** 이 요청의 CAS 가 쓴 값 — 반납 CAS 가 요구하는 현재 값 */
  applied: number;
  /** 되돌릴 값(CAS 전 값) */
  previous: number;
  /** 구매 판정(유효 강제 종료선)에 쓴 **다른** 카운터와 읽은 값 — 반납 CAS 도 이 값을 요구한다 */
  other: { column: SlotColumn; value: number };
  /** clarifier 만 — 슬롯 CAS 가 새 카드를 같은 UPDATE 로 붙였으므로, 반납도 같은 UPDATE 로 drawn_cards 를 슬롯 CAS 전에 읽은 값으로 되돌린다 */
  drawnCards?: DrawnCard[] | null;
}

/** 차감이 **확정 부족**으로 실패한 뒤 — 슬롯을 두 카운터에 대한 CAS 로 반납하고, 정확히 1행이 깨끗이 되돌아갔을 때만 선점한 [END] 를 복원한다.
 *  - 0행: 다른 구매가 위에 쌓였다(카운터가 바뀜). 복원하면 그 구매를 덮으므로 복원하지 않고 대화를 열어 둔다 — 최악은 공짜 슬롯. 경고 로그.
 *  - 반납 오류: 카운터가 올라간 채일 수 있다. 그 상태에서 [END] 만 되살리면 턴 수 < 올라간 선이라 '강제 종료선에서 닫힌 대화'가 아니게 돼
 *    영영 재개할 수 없다 → 복원하지 않는다. 오류 로그(수동 보정 필요).
 *  절대값 UPDATE 가 아니라 CAS 인 이유: 다른 구매가 올린 카운터까지 덮어쓰지 않으려고(예: clarifier 는 최대 2회라 둘이 쌓일 수 있다).
 *  clarifier 는 drawnCards 를 넘겨 카드도 같은 문장으로 되돌린다 — CAS 가 맞았다면 위에 쌓인 구매가 없으니 이 요청의 카드가 배열 맨 끝이다. 0행이면 카드도 슬롯과 함께 남는다(공짜 카드).
 *  결과가 불명한 차감(rpc_error)엔 부르지 않는다 — 라우트가 반납·복원 없이 성공으로 처리한다(spend_unknown_granted). */
export async function undoSlotAndRestore(
  supabase: ServiceSupabase,
  claim: Extract<ReopenClaim, { ok: true }>,
  slot: SlotUndo,
  log: ReopenLog,
): Promise<"rolled_back" | "stacked" | "error"> {
  const ctx = { route: log.route, userId: log.userId };
  const { data, error } = await supabase
    .from("readings")
    .update({
      [slot.column]: slot.previous,
      ...(slot.drawnCards === undefined ? {} : { drawn_cards: slot.drawnCards }),
    })
    .eq("id", slot.readingId)
    .eq(slot.column, slot.applied)
    .eq(slot.other.column, slot.other.value)
    .select("id");
  if (error) {
    console.error(`${log.tag} 선점 반납 실패 — 수동 보정 필요(재개 [END] 복원도 건너뜀):`, {
      readingId: log.readingId,
      userId: log.userId,
    });
    await log.logError(error, { ...ctx, extra: { stage: "slot_rollback", readingId: log.readingId } });
    return "error";
  }
  if (!data || data.length !== 1) {
    await log.logWarn(
      `slot_rollback_stacked: 다른 구매가 위에 쌓여 슬롯 반납·[END] 복원을 건너뛴다(${slot.column}) — 대화는 열어 둔다`,
      { ...ctx, extra: { stage: "slot_rollback_stacked", readingId: log.readingId } },
    );
    return "stacked";
  }
  await claim.restore();
  return "rolled_back";
}
