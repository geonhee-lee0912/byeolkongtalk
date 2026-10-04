// 대화 연장(extend) 구매 — extra_turns += EXTEND_TURNS + 별 차감.
// 검증: 세션 → 소유권 → has_sensitive false → 종료 상태(조회 실패 500 · 늦게 온 요청 409 · 끝났는데 강제 종료선이 아니면 400)
//      → 한도·잔액 사전 확인(선점 앞) → [재개 선점] → 한도(CAS) → 차감 → DB 업데이트.
// 강제 종료선에서 닫힌 타로 대화는 예외로 허용한다 — 끝 [END] 제거를 차감 **전에** 선점하고(사용자 결정 2026-10-04 ④),
// 이후 슬롯 CAS 가 0행이거나 차감이 확정 부족(insufficient)으로 실패하면 되돌린다(슬롯 반납 CAS 가 깨끗이 적용됐을 때만 [END] 복원). 그래서 실패는 돈이 움직이기 전이다.
// 결과가 불명한 경우는 되돌리지 않는다 — 슬롯 CAS 오류·차감 rpc_error 는 실제로 적용·커밋됐을 수 있어, 사용자에게 유리한 쪽(열린 대화·올라간 슬롯)으로 둔다.
// 사주(공용 라우트)는 endedAtAbsCap=false 라 재개 경로를 타지 않는다. 종전과 다른 점 둘: 종료 상태 조회 오류는 이제 사주도 500(예전엔 fail-open),
// 한도·잔액 사전 확인이 슬롯 선점 앞에 붙는다(같은 400/402 응답을 쓰기 없이 먼저 준다).

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { getStarBalance, spendStars } from "@/lib/stars";
import { logError, logWarn } from "@/lib/logger";
import { EXTEND_COST, EXTEND_TURNS, EXTEND_MAX } from "@/lib/upsell";
import { loadTarotEndState, claimTarotReopen, undoSlotAndRestore } from "@/lib/tarot/reopen-server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .select("id, user_id, has_sensitive, extra_turns, clarifier_count, consultation_type, spread_type")
    .eq("id", id)
    .maybeSingle();

  if (rErr || !reading) {
    return NextResponse.json({ error: "reading_not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (reading.has_sensitive) {
    return NextResponse.json({ error: "sensitive_blocked" }, { status: 403 });
  }

  const route = `/api/readings/${id}/extend`;

  // 종료 상태 — 구매 반영 전 행으로 판정(spec §3-4). 조회 실패면 차감 전에 500.
  const { state: endState, error: endErr } = await loadTarotEndState(supabase, reading);
  if (endErr) {
    await logError(endErr, { route, userId, extra: { stage: "end_state", readingId: id } });
    return NextResponse.json({ error: "end_state_error" }, { status: 500 });
  }
  // 늦게 온 요청 — 다른 구매가 [END] 를 선점한 채 진행 중이다(열려 있는데 턴 수 ≥ 강제 종료선). 이 요청이 '열린 대화'로 보고 진행하면
  // 선점한 쪽이 실패해 [END] 를 되살릴 때 이 요청의 구매를 덮는다 → 쓰기 없이 409.
  if (endState.claimInProgress) {
    return NextResponse.json({ error: "purchase_in_progress" }, { status: 409 });
  }
  // [END] 가 있으면 400 — 단 타로가 강제 종료선에서 닫혔으면(endedAtAbsCap) 재개 구매를 허용한다
  if (endState.ended && !endState.endedAtAbsCap) {
    return NextResponse.json({ error: "reading_already_ended" }, { status: 400 });
  }

  const extraTurns = (reading.extra_turns as number) ?? 0;
  const clarifierCount = (reading.clarifier_count as number) ?? 0;

  // 사전 확인 — 선점 앞에서 걸러 [END] 제거·복원 왕복을 피한다. 한도 CAS 와 차감이 여전히 진짜 가드다(잔액 조회는 비원자 최적화일 뿐).
  if (extraTurns >= EXTEND_TURNS * EXTEND_MAX) {
    return NextResponse.json({ error: "extend_limit_reached", max: EXTEND_MAX }, { status: 400 });
  }
  const balance = await getStarBalance(userId);
  if (balance < EXTEND_COST) {
    return NextResponse.json({ error: "insufficient", balance }, { status: 402 });
  }

  // 강제 종료선에서 닫힌 타로 대화 — [END] 제거를 차감 전에 선점(사용자 결정 2026-10-04 ④): 실패는 항상 돈 받기 전.
  // claim.restore 는 슬롯 CAS 가 0행일 때만 부른다(차감 실패 쪽은 undoSlotAndRestore 가 반납이 깨끗할 때만 부른다).
  const log = { tag: "[extend]", route, userId, readingId: id, logError, logWarn };
  const claim = await claimTarotReopen(supabase, endState, log);
  if (!claim.ok) {
    // 더블탭에서 진 쪽 — 먼저 선점한 요청이 진행 중이다(경고 로그는 helper 가 남겼다). 진짜 DB 오류만 500.
    return claim.reason === "claim_lost"
      ? NextResponse.json({ error: "purchase_in_progress" }, { status: 409 })
      : NextResponse.json({ error: "reopen_failed" }, { status: 500 });
  }

  // 슬롯 원자 선점 — CAS: 읽었던 값과 정확히 일치할 때만 +EXTEND_TURNS.
  // 두 카운터 모두 고정한다(clarifier_count 도) — 둘 다 유효 강제 종료선을 정하므로, 구매 판정('열려 있다/닫혔다')에 쓴 상태가 그대로일 때만 쓴다.
  // 안 그러면 늦게 온 요청이 다른 요청이 올렸다 반납한 카운터를 근거로 '열린 대화'라 판단한 채 CAS 를 통과해, [END] 가 복원된 대화에 자기 슬롯만 남긴다(영영 재개 불가).
  // 반환 0행 → 한도 소진 또는 동시 경합 — 어느 쪽이든 차감 없이 400.
  const { data: slotRows, error: slotErr } = await supabase
    .from("readings")
    .update({ extra_turns: extraTurns + EXTEND_TURNS })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("extra_turns", extraTurns)
    .eq("clarifier_count", clarifierCount)
    .lt("extra_turns", EXTEND_TURNS * EXTEND_MAX)
    .select("extra_turns");

  if (slotErr) {
    // 결과 불명 — CAS 가 실제로 적용됐는데 응답만 오류일 수 있다. 그 상태에서 [END] 를 되살리면 올라간 선 아래에서 닫혀 영영 재개할 수 없으므로
    // 복원하지 않고 열어 둔다(사용자에게 유리). 실제로 안 적용됐어도 열려 있는데 선에 닿은 상태라 채팅 한 턴이 다시 닫는다(무료 1턴, 그 사이 구매는 409).
    await logError(slotErr, {
      route,
      userId,
      extra: { stage: "slot_atomic", readingId: id, reopenedLeftOpen: claim.reopened !== null },
    });
    return NextResponse.json({ error: "slot_error" }, { status: 500 });
  }
  if (!slotRows || slotRows.length === 0) {
    await claim.restore();
    return NextResponse.json(
      { error: "extend_limit_reached", max: EXTEND_MAX },
      { status: 400 }
    );
  }

  const newExtraTurns = slotRows[0].extra_turns as number;

  // 별 차감
  const spend = await spendStars(userId, EXTEND_COST, {
    readingId: id,
    source: "extend",
  });
  if (!spend.success) {
    // 결과가 불명(rpc_error 등) — RPC 가 실제로 커밋됐을 수 있다. 반납·복원 둘 다 하지 않고(사용자에게 유리) 500 만 준다.
    if (spend.reason !== "insufficient") {
      console.error("[extend] 차감 결과 불명 — 슬롯·재개 유지, 별 차감 여부 확인 필요:", { readingId: id, userId, reason: spend.reason });
      await logError(new Error(`spend_unknown: ${spend.reason ?? "no reason"}`), {
        route,
        userId,
        extra: { stage: "spend_unknown", readingId: id },
      });
      return NextResponse.json({ error: "spend_unknown" }, { status: 500 });
    }
    // 확정 부족 — 슬롯을 두 카운터 CAS 로 반납하고, 깨끗이 반납됐을 때만 선점한 [END] 를 복원한다
    await undoSlotAndRestore(
      supabase,
      claim,
      {
        column: "extra_turns",
        applied: newExtraTurns,
        previous: extraTurns,
        other: { column: "clarifier_count", value: clarifierCount },
      },
      log,
    );
    return NextResponse.json(
      { error: "insufficient", balance: spend.balance },
      { status: 402 }
    );
  }

  return NextResponse.json({ extraTurns: newExtraTurns, reopened: claim.reopened !== null });
}
