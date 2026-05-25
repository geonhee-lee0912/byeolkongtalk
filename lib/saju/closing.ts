// 별콩이 마무리 한마디 자동 추출 — result 페이지 + OG 이미지 description 노출용.
// 페르소나 가이드: 응답 끝에 "별콩이가 응원할게" 류 응원 한마디 포함.
// 마지막 assistant 메시지의 마지막 문단을 그대로 사용.

export function extractClosingLine(
  messages: { role: "user" | "assistant"; content: string }[]
): string | null {
  // 마지막 assistant 메시지 찾기
  let last: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      last = messages[i].content;
      break;
    }
  }
  if (!last) return null;

  // [END] 마커 제거
  const cleaned = last.replace(/\[END\]\s*$/, "").trim();
  if (!cleaned) return null;

  // 마지막 문단 추출 (빈 줄로 분리된 블록)
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;

  const lastParagraph = paragraphs[paragraphs.length - 1];

  // 너무 길면 첫 2~3 문장만 (250자 cap)
  if (lastParagraph.length <= 250) return lastParagraph;
  const sentences = lastParagraph.split(/(?<=[.!?…])\s+/);
  let acc = "";
  for (const s of sentences) {
    if (acc.length + s.length > 250) break;
    acc += (acc ? " " : "") + s;
  }
  return acc || lastParagraph.slice(0, 250);
}
