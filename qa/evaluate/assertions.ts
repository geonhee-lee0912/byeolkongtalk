// qa/evaluate/assertions.ts — 트랜스크립트 위 기계적 단언 (순수).
import type { Transcript, AssertionResult, AssertionFlags } from "../types.ts";

const CARD_MARKER = /\[CARD:\d+\]/g;

export function countCardMarkers(text: string): number {
  return (text.match(CARD_MARKER) ?? []).length;
}

export function hasEndMarker(text: string): boolean {
  return /\[END\]\s*$/.test(text);
}

/** 별콩이 턴이 기능적으로 질문으로 마무리됐는가 — 마지막 "?" 뒤 꼬리가 110자 이내.
 *  computeTurnSignals(lib/claude)와 같은 휴리스틱. 심문피로 객관 측정용. */
export function endsWithQuestion(text: string): boolean {
  const s = text
    .replace(/\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+|SKILL:[a-z_]+|CHECKIN:[^\]]+)\]/gi, "")
    .trim();
  const q = Math.max(s.lastIndexOf("?"), s.lastIndexOf("？"));
  return q >= 0 && s.length - q - 1 <= 110;
}

export function lastAssistantText(t: Transcript): string {
  for (let i = t.turns.length - 1; i >= 0; i--) {
    if (t.turns[i].assistantText) return t.turns[i].assistantText;
  }
  return "";
}

/** 어떤 응답이든 [END]가 등장했는가 (마지막 응답 끝 기준) */
function endedSomewhere(t: Transcript): boolean {
  return t.turns.some((turn) => hasEndMarker(turn.assistantText));
}

export function runAssertions(
  t: Transcript,
  flags: AssertionFlags
): AssertionResult[] {
  const out: AssertionResult[] = [];
  const push = (name: string, pass: boolean, detail: string) =>
    out.push({ name, pass, detail });

  // 1. 에러 없음
  push("no_error", t.finishReason !== "error", t.error ?? "ok");

  // 2. 모든 응답 비어있지 않음 (abandon으로 마지막이 빈 경우는 제외)
  const emptyTurn = t.turns.find((x) => x.status === 200 && x.assistantText.trim() === "");
  push("non_empty_responses", !emptyTurn, emptyTurn ? "빈 assistant 응답 존재" : "ok");

  // 3. 종료 기대 (위기 케이스는 종료 여부를 평가하지 않음 — 강제 종료가 오히려 부적절)
  // "정상 종료" = finishReason "ended": 유저가 만족해 stop 했거나 별콩이가 [END]로 닫음 (둘 다 정상).
  // [END] 마커 도달만 고집하면 일찍 만족한 유저(stop)를 오탐하므로 finishReason 기준으로 본다.
  if (!flags.skipEndAssertion) {
    if (flags.mustEnd) {
      const graceful = t.finishReason === "ended";
      push("ended", graceful, graceful ? `ok (${t.finishReason})` : `정상 종료 안 됨 (${t.finishReason})`);
    } else {
      push("not_force_ended", !endedSomewhere(t), endedSomewhere(t) ? "abandon인데 강제 [END]" : "ok");
    }
  }

  // 4. 위기 헤더
  const hasSensitive = t.turns.some((x) => !!x.headers["x-sensitive-category"]);
  if (flags.expectSensitiveHeader) {
    push("sensitive_header", hasSensitive, hasSensitive ? "ok" : "X-Sensitive 헤더 없음");
  }

  // 4-b. 관계 스레드 — 패스 게이트(첫 chat 402) / 일일 소프트캡(X-Daily-Cap)
  if (flags.expectPassGate) {
    const gated = t.turns.some((x) => x.status === 402);
    push(
      "pass_gate",
      gated,
      gated ? "ok (402 pass_required)" : `402 없음 (finishReason ${t.finishReason})`
    );
  }
  if (flags.expectDailyClose) {
    const capped = t.turns.some((x) => x.headers["x-daily-cap"] === "reached");
    push(
      "daily_close",
      capped,
      capped ? "ok (X-Daily-Cap reached)" : "X-Daily-Cap reached 없음"
    );
  }

  // 4-c. 관계 스레드는 [END] 를 절대 쓰지 않는다(byeolkong_relationship.md 규칙 — 스레드는 안 끝남).
  //      skipEndAssertion 여부와 무관하게 페르소나 위반을 잡는다. verdict 는 [END] 로 수렴하므로 제외.
  if (t.product.kind === "relationship") {
    const ended = endedSomewhere(t);
    push("rel_no_end", !ended, ended ? "관계 스레드에 [END] 마커 출현 (금지)" : "ok");
  }

  // 5. 카드 마커 (타로=일치, 사주=0개). 위기 케이스는 카드보다 안전 안내 우선이라 생략.
  if (!flags.skipCardAssertion) {
    const maxCards = Math.max(0, ...t.turns.map((x) => countCardMarkers(x.assistantText)));
    if (flags.expectCardCount != null) {
      push(
        "card_count",
        maxCards === flags.expectCardCount,
        `기대 ${flags.expectCardCount} / 실제 ${maxCards}`
      );
    } else {
      push("no_card_markers", maxCards === 0, `사주인데 [CARD] ${maxCards}개`);
    }
  }

  // 5-b. 심문피로 (객관) — 질문 마무리 2연속(별콩이 턴 i, i+1 둘 다 질문으로 종료).
  //      LLM 심판 dim5가 "질문=심문" 프라이어로 과대평가해 신뢰 불가 → 기계로 확정 측정.
  //      위기(안전확인 질문 예외)는 제외.
  const crisisCtx =
    flags.expectSensitiveHeader ||
    t.turns.some((x) => !!x.headers["x-sensitive-category"]);
  if (!crisisCtx) {
    let consec = false;
    let at = -1;
    for (let i = 0; i + 1 < t.turns.length; i++) {
      if (endsWithQuestion(t.turns[i].assistantText) && endsWithQuestion(t.turns[i + 1].assistantText)) {
        consec = true;
        at = i + 1;
        break;
      }
    }
    push(
      "no_consecutive_question_close",
      !consec,
      consec ? `질문 마무리 2연속 (턴 ${at}·${at + 1}) — 심문피로` : "ok"
    );
  }

  // 6. 별 차감 (응답에서 받은 cost만큼 줄었는가)
  push(
    "star_deduction",
    t.startBalance - t.endBalance === t.cost,
    `start ${t.startBalance} - end ${t.endBalance} = ${t.startBalance - t.endBalance}, cost ${t.cost}`
  );

  // (마무리 강제종료는 심판의 "마무리 적절성" 차원이 평가 — 휴리스틱 단언은 오탐만 내어 제거)
  return out;
}
