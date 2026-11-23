// 결과 화면 '대화 전체 다시보기' 시트에 보일 말들 — 맨 앞 내 말이 이 고민 그대로면 뺀다.
// 결과 화면 위 '나의 고민'에 이미 있어 펼치면 같은 글이 또 나왔다(디자인 다듬기 /tarot/result ①, 운영자 11-15).
export function replayMessages<M extends { role: "user" | "assistant"; content: string }>(
  messages: M[],
  question: string
): M[] {
  const first = messages[0];
  if (first && first.role === "user" && first.content.trim() === question.trim()) return messages.slice(1);
  return messages;
}
