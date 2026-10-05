// 보조 카드 구매 직후 클라가 자동으로 보내는 user 턴 문구 — app/tarot/reading/page.tsx handleClarifierDrawn 이 쓴다.
//
// ⚠️ 이 문장은 classifyUserTurn(./user-turn.ts) 에서 계속 asking 이어야 한다.
// 강제 종료선에서 닫힌 대화를 보조 카드 구매로 재개하면(spec 2026-10-04 §3-4) 이 턴은 대개 자연 마무리선 턴인데,
// 그 턴에서 asking 만 keep-open 을 만든다 — 아니면 방금 산 카드 풀이가 곧장 대화를 닫는다.
// 문구를 고치면 ./user-turn.test.ts 의 계약 핀이 이 함수를 직접 불러 검사한다.
export function clarifierSyntheticMessage(cardDesc: string): string {
  return `방금 보조 카드로 ${cardDesc}를 더 뽑았어. 지금까지 흐름이랑 이어서 봐줘`;
}

// 판정용 앞·뒤 고정 문구는 위 템플릿 함수에서 그대로 뽑는다 — 문구를 고치면 판정이 같이 따라간다(드리프트 불가).
// 자리표시(${cardDesc})가 템플릿에 정확히 한 번이어야 한다(./clarifier-message.test.ts 가 고정).
const SENTINEL = "\u0000";
const [PREFIX, SUFFIX] = clarifierSyntheticMessage(SENTINEL).split(SENTINEL);

/**
 * 이 유저 말이 보조 카드 구매 직후 클라가 자동으로 보낸 synthetic 메시지인가 — 앞·뒤 고정 문구 사이에 카드 설명이 한 글자 이상 끼어 있을 때만(앵커: 앞뒤에 다른 글자가 붙으면 아니다).
 * ⑦(spec 2026-10-04 §3-4): 턴 수만으로는 보조 카드를 대화 중에 일찍 산 리딩이 나중에 같은 턴 수를 지날 때도 걸리므로, 재개 직후 카드 풀이 턴 판정은 이것과 함께 쓴다.
 */
export function isClarifierSyntheticMessage(text: string): boolean {
  return text.length > PREFIX.length + SUFFIX.length && text.startsWith(PREFIX) && text.endsWith(SUFFIX);
}
