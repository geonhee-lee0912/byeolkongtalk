// 보조 카드(clarifier) 구매 — 타로 리딩 중 카드 1장 추가 + 별 차감.
// 검증: 세션 → 소유권 → tarot 타입 → 종료 상태(조회 실패 500 · 늦게 온 요청 409 · 끝났는데 강제 종료선이 아니면 400) → 카드 중복
//      → 한도·잔액 사전 확인(선점 앞) → [재개 선점] → 한도(CAS) → 차감 → DB 업데이트.
// 강제 종료선에서 닫힌 대화는 예외로 허용한다 — 끝 [END] 제거를 차감 **전에** 선점하고(사용자 결정 2026-10-04 ④),
// 이후 슬롯 CAS 가 0행이거나 차감이 확정 부족(insufficient)으로 실패하면 되돌린다(슬롯 반납 CAS 가 깨끗이 적용됐을 때만 [END] 복원). 그래서 돈이 움직이기 전의 실패는 되돌려진다.
// 결과가 불명한 경우는 되돌리지 않는다 — 슬롯 CAS 오류·차감 rpc_error 는 실제로 적용·커밋됐을 수 있어, 사용자에게 유리한 쪽(열린 대화·올라간 슬롯)으로 둔다.
// "실패는 돈 받기 전" 의 유일한 예외: 차감 뒤 drawn_cards 갱신 실패는 구매가 성립한 뒤라 복원하지 않는다 — 수동 보정, 대화는 열린 채 둔다.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { getStarBalance, spendStars } from "@/lib/stars";
import { logError, logWarn } from "@/lib/logger";
import { CLARIFIER_COST, CLARIFIER_MAX } from "@/lib/upsell";
import type { DrawnCard } from "@/lib/tarot/spreads";
import { loadTarotEndState, claimTarotReopen, undoSlotAndRestore } from "@/lib/tarot/reopen-server";

export const dynamic = "force-dynamic";

interface ClarifierBody {
  readingId: string;
  card: {
    card_id: number;
    direction: "upright" | "reversed";
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  let body: ClarifierBody;
  try {
    body = (await request.json()) as ClarifierBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.readingId !== "string" || !body.readingId) {
    return NextResponse.json({ error: "readingId_required" }, { status: 400 });
  }
  if (
    !body.card ||
    typeof body.card.card_id !== "number" ||
    body.card.card_id < 0 ||
    body.card.card_id > 77 ||
    !Number.isInteger(body.card.card_id) ||
    (body.card.direction !== "upright" && body.card.direction !== "reversed")
  ) {
    return NextResponse.json({ error: "invalid_card" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .select(
      "id, user_id, consultation_type, drawn_cards, clarifier_count, has_sensitive, spread_type, extra_turns"
    )
    .eq("id", body.readingId)
    .maybeSingle();

  if (rErr || !reading) {
    return NextResponse.json({ error: "reading_not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (reading.consultation_type !== "tarot") {
    return NextResponse.json({ error: "not_a_tarot_reading" }, { status: 400 });
  }
  if (reading.has_sensitive) {
    return NextResponse.json({ error: "sensitive_blocked" }, { status: 403 });
  }

  const route = "/api/consultations/tarot/clarifier";

  // 종료 상태 — 구매 반영 전 행으로 판정(spec §3-4). 조회 실패면 차감 전에 500.
  const { state: endState, error: endErr } = await loadTarotEndState(supabase, reading);
  if (endErr) {
    await logError(endErr, { route, userId, extra: { stage: "end_state", readingId: reading.id } });
    return NextResponse.json({ error: "end_state_error" }, { status: 500 });
  }
  // 늦게 온 요청 — 다른 구매가 [END] 를 선점한 채 진행 중이다(열려 있는데 턴 수 ≥ 강제 종료선). 이 요청이 '열린 대화'로 보고 진행하면
  // 선점한 쪽이 실패해 [END] 를 되살릴 때 이 요청의 구매를 덮는다 → 쓰기 없이 409.
  if (endState.claimInProgress) {
    return NextResponse.json({ error: "purchase_in_progress" }, { status: 409 });
  }
  // [END] 가 있으면 400 — 단 강제 종료선에서 닫혔으면(endedAtAbsCap) 재개 구매를 허용한다
  if (endState.ended && !endState.endedAtAbsCap) {
    return NextResponse.json({ error: "reading_already_ended" }, { status: 400 });
  }

  // 카드 중복 검증 — 기존 drawn_cards에 동일 card_id 없어야 함 (재개 선점보다 앞 — 이 거절은 아무것도 쓰기 전에)
  const drawnCards = ((reading.drawn_cards as DrawnCard[]) ?? []);
  if (drawnCards.some((c) => c.card_id === body.card.card_id)) {
    return NextResponse.json({ error: "card_already_drawn" }, { status: 400 });
  }

  const clarifierCount = (reading.clarifier_count as number) ?? 0;
  const extraTurns = (reading.extra_turns as number) ?? 0;

  // 사전 확인 — 선점 앞에서 걸러 [END] 제거·복원 왕복을 피한다. 한도 CAS 와 차감이 여전히 진짜 가드다(잔액 조회는 비원자 최적화일 뿐).
  if (clarifierCount >= CLARIFIER_MAX) {
    return NextResponse.json({ error: "clarifier_limit_reached", max: CLARIFIER_MAX }, { status: 400 });
  }
  const balance = await getStarBalance(userId);
  if (balance < CLARIFIER_COST) {
    return NextResponse.json({ error: "insufficient", balance }, { status: 402 });
  }

  // 강제 종료선에서 닫힌 대화 — [END] 제거를 차감 전에 선점(사용자 결정 2026-10-04 ④): 실패는 항상 돈 받기 전.
  // claim.restore 는 슬롯 CAS 가 0행일 때만 부른다(차감 실패 쪽은 undoSlotAndRestore 가 반납이 깨끗할 때만 부른다).
  const log = { tag: "[clarifier]", route, userId, readingId: reading.id as string, logError, logWarn };
  const claim = await claimTarotReopen(supabase, endState, log);
  if (!claim.ok) {
    // 더블탭에서 진 쪽 — 먼저 선점한 요청이 진행 중이다(경고 로그는 helper 가 남겼다). 진짜 DB 오류만 500.
    return claim.reason === "claim_lost"
      ? NextResponse.json({ error: "purchase_in_progress" }, { status: 409 })
      : NextResponse.json({ error: "reopen_failed" }, { status: 500 });
  }

  // 슬롯 원자 선점 — CAS: 읽었던 값과 정확히 일치할 때만 +1 (MAX>1이라 .lt만으론
  // 동시 요청이 둘 다 stale+1 을 써서 별만 2회 차감되는 구멍이 남음).
  // 두 카운터 모두 고정한다(extra_turns 도) — 둘 다 유효 강제 종료선을 정하므로, 구매 판정('열려 있다/닫혔다')에 쓴 상태가 그대로일 때만 쓴다.
  // 안 그러면 늦게 온 요청이 다른 요청이 올렸다 반납한 카운터를 근거로 '열린 대화'라 판단한 채 CAS 를 통과해, [END] 가 복원된 대화에 자기 슬롯만 남긴다(영영 재개 불가).
  // 반환 0행 → 한도 소진 또는 동시 경합 — 어느 쪽이든 차감 없이 400 (재시도 가능).
  const { data: slotRows, error: slotErr } = await supabase
    .from("readings")
    .update({ clarifier_count: clarifierCount + 1 })
    .eq("id", reading.id)
    .eq("user_id", userId)
    .eq("clarifier_count", clarifierCount)
    .eq("extra_turns", extraTurns)
    .lt("clarifier_count", CLARIFIER_MAX)
    .select("clarifier_count");

  if (slotErr) {
    // 결과 불명 — CAS 가 실제로 적용됐는데 응답만 오류일 수 있다. 그 상태에서 [END] 를 되살리면 올라간 선 아래에서 닫혀 영영 재개할 수 없으므로
    // 복원하지 않고 열어 둔다(사용자에게 유리). 실제로 안 적용됐어도 열려 있는데 선에 닿은 상태라 채팅 한 턴이 다시 닫는다(무료 1턴, 그 사이 구매는 409).
    await logError(slotErr, {
      route,
      userId,
      extra: { stage: "slot_atomic", readingId: reading.id, reopenedLeftOpen: claim.reopened !== null },
    });
    return NextResponse.json({ error: "slot_error" }, { status: 500 });
  }
  if (!slotRows || slotRows.length === 0) {
    await claim.restore();
    return NextResponse.json(
      { error: "clarifier_limit_reached", max: CLARIFIER_MAX },
      { status: 400 }
    );
  }

  const newClarifierCount = slotRows[0].clarifier_count as number;

  // 별 차감
  const spend = await spendStars(userId, CLARIFIER_COST, {
    readingId: reading.id,
    source: "clarifier",
  });
  if (!spend.success) {
    // 결과가 불명(rpc_error 등) — RPC 가 실제로 커밋됐을 수 있다. 반납·복원 둘 다 하지 않고(사용자에게 유리) 500 만 준다.
    if (spend.reason !== "insufficient") {
      console.error("[clarifier] 차감 결과 불명 — 슬롯·재개 유지, 별 차감 여부 확인 필요:", { readingId: reading.id, userId, reason: spend.reason });
      await logError(new Error(`spend_unknown: ${spend.reason ?? "no reason"}`), {
        route,
        userId,
        extra: { stage: "spend_unknown", readingId: reading.id },
      });
      return NextResponse.json({ error: "spend_unknown" }, { status: 500 });
    }
    // 확정 부족 — 슬롯을 두 카운터 CAS 로 반납하고, 깨끗이 반납됐을 때만 선점한 [END] 를 복원한다
    await undoSlotAndRestore(
      supabase,
      claim,
      {
        column: "clarifier_count",
        applied: newClarifierCount,
        previous: clarifierCount,
        other: { column: "extra_turns", value: extraTurns },
      },
      log,
    );
    return NextResponse.json(
      { error: "insufficient", balance: spend.balance },
      { status: 402 }
    );
  }

  // drawn_cards 업데이트
  const newCard: DrawnCard = {
    position: drawnCards.length,
    label: "보조 카드",
    card_id: body.card.card_id,
    direction: body.card.direction,
  };
  const updatedCards = [...drawnCards, newCard];

  const { error: updateErr } = await supabase
    .from("readings")
    .update({ drawn_cards: updatedCards })
    .eq("id", reading.id);

  if (updateErr) {
    // 차감·선점 성공 후 drawn_cards 업데이트 실패 — 수동 보정 필요
    console.error(
      "[clarifier] drawn_cards UPDATE 실패 — 수동 보정 필요:",
      { readingId: reading.id, userId, newCard, updateErr }
    );
    await logError(updateErr, { route, userId, extra: { stage: "update_drawn_cards", readingId: reading.id } });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    drawnCards: updatedCards,
    clarifierCount: newClarifierCount,
    reopened: claim.reopened !== null,
  });
}
