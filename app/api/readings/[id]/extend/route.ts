// 대화 연장(extend) 구매 — extra_turns += EXTEND_TURNS + 별 차감.
// 검증: 세션 → 소유권 → has_sensitive false → 종료 상태(조회 실패 500 · 끝났는데 강제 종료선이 아니면 400) → [재개 선점] → 한도(CAS) → 차감 → DB 업데이트.
// 강제 종료선에서 닫힌 타로 대화는 예외로 허용한다 — 끝 [END] 제거를 차감 **전에** 선점하고(사용자 결정 2026-10-04 ④),
// 이후 CAS·차감이 실패하면 원문을 복원한다. 그래서 실패는 항상 돈이 움직이기 전이다. 사주(공용 라우트)는 endedAtAbsCap=false 라 종전 그대로.

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { EXTEND_COST, EXTEND_TURNS, EXTEND_MAX } from "@/lib/upsell";
import { loadTarotEndState, reopenTarotReading, restoreTarotEnd } from "@/lib/tarot/reopen-server";

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

  // 종료 상태 — 구매 반영 전 행으로 판정(spec §3-4). 조회 실패면 차감 전에 500.
  const { state: endState, error: endErr } = await loadTarotEndState(supabase, reading);
  if (endErr) {
    await logError(endErr, {
      route: `/api/readings/${id}/extend`,
      userId,
      extra: { stage: "end_state", readingId: id },
    });
    return NextResponse.json({ error: "end_state_error" }, { status: 500 });
  }
  // [END] 가 있으면 400 — 단 타로가 강제 종료선에서 닫혔으면(endedAtAbsCap) 재개 구매를 허용한다
  if (endState.ended && !endState.endedAtAbsCap) {
    return NextResponse.json({ error: "reading_already_ended" }, { status: 400 });
  }

  const extraTurns = (reading.extra_turns as number) ?? 0;

  // 강제 종료선에서 닫힌 타로 대화 — [END] 제거를 차감 전에 선점(사용자 결정 2026-10-04 ④): 실패는 항상 돈 받기 전
  let reopened: { id: string; content: string } | null = null;
  if (endState.endedAtAbsCap && endState.lastAssistant) {
    const { error: reopenErr } = await reopenTarotReading(supabase, endState.lastAssistant);
    if (reopenErr) {
      await logError(reopenErr, {
        route: `/api/readings/${id}/extend`,
        userId,
        extra: { stage: "reopen", readingId: id },
      });
      return NextResponse.json({ error: "reopen_failed" }, { status: 500 });
    }
    reopened = endState.lastAssistant;
  }
  // 선점한 [END] 제거를 원문으로 되돌린다 — 이후 CAS·차감이 실패했을 때만 부른다.
  // 복원이 실패해도 최악은 무료 1턴(다음 채팅 턴이 강제 종료선이라 바로 닫힌다)이라 로그만 남기고 원래 응답을 그대로 준다.
  const restoreIfReopened = async () => {
    const claimed = reopened;
    if (!claimed) return;
    const { error: restoreErr } = await restoreTarotEnd(supabase, claimed);
    if (restoreErr) {
      console.error("[extend] 재개 선점 복원 실패 — 수동 보정 필요:", {
        readingId: id,
        userId,
        messageId: claimed.id,
      });
      await logError(restoreErr, {
        route: `/api/readings/${id}/extend`,
        userId,
        extra: { stage: "reopen_restore", readingId: id, messageId: claimed.id },
      });
    }
  };

  // 슬롯 원자 선점 — CAS: 읽었던 값과 정확히 일치할 때만 +EXTEND_TURNS.
  // 반환 0행 → 한도 소진 또는 동시 경합 — 어느 쪽이든 차감 없이 400.
  const { data: slotRows, error: slotErr } = await supabase
    .from("readings")
    .update({ extra_turns: extraTurns + EXTEND_TURNS })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("extra_turns", extraTurns)
    .lt("extra_turns", EXTEND_TURNS * EXTEND_MAX)
    .select("extra_turns");

  if (slotErr) {
    await restoreIfReopened();
    await logError(slotErr, {
      route: `/api/readings/${id}/extend`,
      userId,
      extra: { stage: "slot_atomic", readingId: id },
    });
    return NextResponse.json({ error: "slot_error" }, { status: 500 });
  }
  if (!slotRows || slotRows.length === 0) {
    await restoreIfReopened();
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
    // 선점 반납
    const { error: rollbackErr } = await supabase
      .from("readings")
      .update({ extra_turns: newExtraTurns - EXTEND_TURNS })
      .eq("id", id);
    if (rollbackErr) {
      console.error("[extend] 선점 반납 실패 — 수동 보정 필요:", { readingId: id, userId });
      await logError(rollbackErr, {
        route: `/api/readings/${id}/extend`,
        userId,
        extra: { stage: "slot_rollback", readingId: id },
      });
    }
    await restoreIfReopened();
    return NextResponse.json(
      { error: "insufficient", balance: spend.balance },
      { status: 402 }
    );
  }

  return NextResponse.json({ extraTurns: newExtraTurns, reopened: reopened !== null });
}
