// qa/evaluate/assertions.ts — 트랜스크립트 위 기계적 단언 (순수).
import type { Transcript, AssertionResult, AssertionFlags } from "../types.ts";
import { SPREAD_INFO, type SpreadType } from "../../lib/tarot/spreads.ts";
import { getCard } from "../../lib/tarot/cards.ts";

const CARD_MARKER = /\[CARD:\d+\]/g;

export function countCardMarkers(text: string): number {
  return (text.match(CARD_MARKER) ?? []).length;
}

export function hasEndMarker(text: string): boolean {
  return /\[END\]\s*$/.test(text);
}

/** 인-스레드 스킬(판정) 종료 마커. */
export function hasSkillDoneMarker(text: string): boolean {
  return /\[SKILL_DONE\]/.test(text);
}

/** 마커([CARD:n]/[END]/[RECO:...]/[SKILL:...]/[SKILL_DONE]/[CHECKIN:...]) 전부 제거 + trim.
 *  글자수 단언(분량 하한)과 질문마무리 판정이 공유하는 단일 strip 규칙. */
export function stripMarkers(text: string): string {
  return text
    .replace(/\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+|SKILL:[a-z_]+|SKILL_DONE|CHECKIN:[^\]]+)\]/gi, "")
    .trim();
}

/** 별콩이 턴이 기능적으로 질문으로 마무리됐는가 — 마지막 "?" 뒤 꼬리가 110자 이내.
 *  computeTurnSignals(lib/claude)와 같은 휴리스틱. 심문피로 객관 측정용. */
export function endsWithQuestion(text: string): boolean {
  const s = stripMarkers(text);
  const q = Math.max(s.lastIndexOf("?"), s.lastIndexOf("？"));
  return q >= 0 && s.length - q - 1 <= 110;
}

/** text 안에서 needle이 등장하는 모든 시작 인덱스(겹침 허용 안 함, 순서대로). */
function allIndicesOf(text: string, needle: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    out.push(idx);
    from = idx + 1;
  }
  return out;
}

/** name의 첫 등장 위치 — 단, 같은 뽑음 세트의 다른(더 긴) 카드 이름 부분 문자열로 걸리는
 *  매치는 제외한다. RWS 덱 한글명은 "여황제"⊃"황제", "여교황"⊃"교황"처럼 성별 접두 변형이
 *  겹치는 쌍이 있어 — 가드 없이 순수 indexOf만 쓰면 5장 이상 스프레드(항상 이 두 쌍을 함께
 *  뽑음)에서 "황제"/"교황"이 자기보다 먼저 나온 "여황제"/"여교황" 때문에 100% 오탐한다. */
function firstNameIndex(text: string, name: string, siblingNames: string[]): number {
  const longerSiblings = siblingNames.filter(
    (other) => other !== name && other.length > name.length && other.includes(name)
  );
  const shadowedSpans = longerSiblings.flatMap((longer) =>
    allIndicesOf(text, longer).map((i) => [i, i + longer.length] as const)
  );
  for (const idx of allIndicesOf(text, name)) {
    const shadowed = shadowedSpans.some(([s, e]) => idx >= s && idx < e);
    if (!shadowed) return idx;
  }
  return -1;
}

/** P1-5: 뽑힌 카드 이름이 자기 [CARD:n] 마커보다 먼저 나오면 안 된다 (도입 훅 스포일러 방지).
 *  QA 하네스는 card_id를 항상 0..cardCount-1 순서로 결정적으로 뽑는다(qa/readings.ts
 *  createTarotReading 참고) — 그래서 실제 API 응답 없이도 SPREAD_INFO의 cardCount만으로
 *  어떤 카드가 뽑혔는지 복원할 수 있다(별도 상태 없음).
 *  마커 자체가 없는 카드는 스킵 — 그건 card_count 단언이 이미 잡는 실패 모드라 중복 판정하지 않는다.
 *  ⚠️ 오탐 위험(단순 substring 검사의 한계, 의도적으로 감수): 카드 한글명이 흔한 낱말과 겹치면
 *  카드와 무관한 문맥에서도 매치될 수 있다. 특히 7장 스프레드의 마지막 카드(card_id=6)는 항상
 *  "연인"(The Lovers)인데, 연애 상담 응답은 상대를 가리키는 일상어로 "연인"을 자주 쓰므로
 *  reunion_deep_7류 케이스에서 실패가 뜨면 진짜 마커 선행 위반인지 우연한 낱말 일치인지 대화
 *  본문을 직접 확인할 것. "바보"(card_id=0, 자기비하 표현과 겹침)도 같은 이유로 낮은 확률의
 *  오탐 후보다.
 */
export function findCardNamesBeforeMarker(text: string, spreadType: SpreadType): string[] {
  const cardCount = SPREAD_INFO[spreadType].cardCount;
  const names: (string | undefined)[] = [];
  for (let i = 0; i < cardCount; i++) names.push(getCard(i)?.name_kr);
  const siblingNames = names.filter((n): n is string => !!n);

  const violations: string[] = [];
  for (let i = 0; i < cardCount; i++) {
    const name = names[i];
    if (!name) continue;
    const marker = `[CARD:${i + 1}]`;
    const markerIdx = text.indexOf(marker);
    if (markerIdx === -1) continue; // 마커 누락은 card_count 단언 몫
    const nameIdx = firstNameIndex(text, name, siblingNames);
    if (nameIdx !== -1 && nameIdx < markerIdx) {
      violations.push(`${marker} "${name}" (이름 idx ${nameIdx} < 마커 idx ${markerIdx})`);
    }
  }
  return violations;
}

const CARD_SKELETON_LABELS = ["🃏 카드가 말하는 것:", "💫 너의 상황에서는", "🔗 흐름 연결:"];

/** P1-4 (골격): 5장 이상 프리미엄 첫 턴은 카드마다 🃏/💫/🔗 3라벨이 다음 마커 전까지
 *  이 순서로 다 있어야 한다 (data/persona/byeolkong_tarot.md §각 카드 해석 골격). */
export function findMissingCardSkeleton(text: string): string[] {
  const markers = [...text.matchAll(/\[CARD:\d+\]/g)];
  const violations: string[] = [];
  for (let i = 0; i < markers.length; i++) {
    const segStart = markers[i].index! + markers[i][0].length;
    const segEnd = i + 1 < markers.length ? markers[i + 1].index! : text.length;
    const segment = text.slice(segStart, segEnd);
    const idxs = CARD_SKELETON_LABELS.map((label) => segment.indexOf(label));
    const inOrder = idxs.every((v) => v !== -1) && idxs[0] < idxs[1] && idxs[1] < idxs[2];
    if (!inOrder) {
      violations.push(`${markers[i][0]} 라벨idx[${idxs.join(",")}] (누락 또는 순서 오류)`);
    }
  }
  return violations;
}

/** 첫 풀이 목표 분량 하한(자) — 출처: data/persona/byeolkong_tarot.md §첫 풀이 목표 분량
 *  (프로즈 스펙, 코드 아님). ⚠️ 그 문서 수치가 바뀌면 이 표도 수동으로 맞춰야 한다(자동 동기화 없음).
 *  하한만 본다 — 과다 분량은 이 단언이 쫓는 실패 모드가 아니다(페르소나 문서 자체가 상한 캡을 명시). */
const FIRST_TURN_MIN_CHARS: Record<number, number> = {
  1: 400, // 원카드 (맛보기) 400~900
  2: 400, // 투카드 (맛보기) 400~900
  3: 1300, // 쓰리카드 1,300~1,700
  5: 2300, // 관계·속마음·재회·새 인연 (5장) 2,300~2,750
  6: 2700, // 관계체크인·계속그만·새사랑준비도·마음치유 (6장) 2,700~3,200
  7: 3300, // 재회심층·가능성·마음차크라 (7장) 3,300~3,800
};

/** P1-4 (분량): 첫 턴 글자수(마커 제외)가 해당 카드 수의 목표 밴드 하한 이상인지. */
export function firstTurnLengthBelowMin(
  text: string,
  cardCount: number
): { below: boolean; detail: string } {
  const min = FIRST_TURN_MIN_CHARS[cardCount];
  if (min == null) return { below: false, detail: `n/a (카드 수 ${cardCount} 밴드 미정의)` };
  const len = stripMarkers(text).length;
  return {
    below: len < min,
    detail: `실제 ${len}자 / 하한 ${min}자${len < min ? " — 미달" : " — 통과"}`,
  };
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

    // 카드 이름 마커 선행 금지 (P1-5) — 첫 턴만. 후속 턴의 "카드 재소환"(마커 없이
    // 이름만 재언급)은 페르소나가 명시적으로 허용하는 정상 동작이라 첫 턴 밖에서 검사하면 오탐만 낸다.
    if (t.product.kind === "tarot" && t.turns[0]) {
      const nameViolations = findCardNamesBeforeMarker(t.turns[0].assistantText, t.product.spreadType);
      push(
        "card_name_before_marker",
        nameViolations.length === 0,
        nameViolations.length ? nameViolations.join("; ") : "ok"
      );

      // 프리미엄(5장 이상) 첫 턴 — 카드별 3라벨 골격(🃏/💫/🔗) + 분량 하한 (P1-4)
      const cardCount = SPREAD_INFO[t.product.spreadType].cardCount;
      if (cardCount >= 5) {
        const skeletonViolations = findMissingCardSkeleton(t.turns[0].assistantText);
        push(
          "premium_card_skeleton",
          skeletonViolations.length === 0,
          skeletonViolations.length ? skeletonViolations.join("; ") : "ok"
        );

        const lengthCheck = firstTurnLengthBelowMin(t.turns[0].assistantText, cardCount);
        push("premium_first_turn_length", !lengthCheck.below, lengthCheck.detail);
      }
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
