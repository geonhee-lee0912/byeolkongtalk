// 보조 카드 구매 직후 클라가 자동으로 보내는 user 턴 문구 — app/tarot/reading/page.tsx handleClarifierDrawn 이 쓴다.
//
// ⚠️ 이 문장은 classifyUserTurn(./user-turn.ts) 에서 계속 asking 이어야 한다.
// 강제 종료선에서 닫힌 대화를 보조 카드 구매로 재개하면(spec 2026-10-04 §3-4) 이 턴은 대개 자연 마무리선 턴인데,
// 그 턴에서 asking 만 keep-open 을 만든다 — 아니면 방금 산 카드 풀이가 곧장 대화를 닫는다.
// 문구를 고치면 ./user-turn.test.ts 의 계약 핀이 이 함수를 직접 불러 검사한다.
export function clarifierSyntheticMessage(cardDesc: string): string {
  return `방금 보조 카드로 ${cardDesc}를 더 뽑았어. 지금까지 흐름이랑 이어서 봐줘`;
}
