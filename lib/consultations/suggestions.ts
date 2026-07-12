// 상담 첫 풀이 직후 노출하는 추천 질문 칩. 탭 시 해당 텍스트로 후속 메시지 전송.
// MVP: 상담 타입별 정적 세트 (감정태그/spread_category 세분화는 이후 리팩).

export const SAJU_SUGGESTIONS: string[] = [
  "올해 연애운은 어때?",
  "조심할 시기가 있을까?",
  "직업·금전운도 봐줘",
];

export const TAROT_SUGGESTIONS: string[] = [
  "이 카드가 말하는 핵심은?",
  "내가 어떻게 하면 좋을까?",
  "앞으로의 흐름이 궁금해",
];

export function getSuggestions(type: "saju" | "tarot"): string[] {
  return type === "tarot" ? TAROT_SUGGESTIONS : SAJU_SUGGESTIONS;
}

// 첫 풀이(assistant 1턴)가 끝났고, 스트리밍/종료 상태가 아닐 때만 칩 노출.
export function shouldShowSuggestions(s: {
  assistantCount: number;
  isStreaming: boolean;
  isEnded: boolean;
}): boolean {
  return s.assistantCount === 1 && !s.isStreaming && !s.isEnded;
}
