// lib/readings/preview.ts — 보관함(/api/readings) 카드의 별콩이 답변 미리보기(순수 · 서버/클라 공용). route.ts 에서 옮김.

// 운세/궁합 등 리포트형 리딩은 messages.content 에 JSON 구조체(v:1)로 저장된다.
// JSON 이면 읽을 수 있는 텍스트 필드만 뽑고, 아니면(타로 상담 채팅 등) 원문 그대로 쓴다.
function extractReportText(content: string): string | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  for (const key of ["summary", "theme", "headline", "intro", "advice"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

// 별콩이 답변 도입부 미리보기용 — 리포트는 텍스트 필드 추출, 카드/종료 마커 제거 후 절단.
// 굵게 표시 별표(**)도 뺀다 — 보관함 미리보기에 '**' 가 그대로 보였다(디자인 다듬기 보관함 ⑥, 11-21).
export function buildPreview(content: string): string {
  const base = extractReportText(content) ?? content;
  const cleaned = base
    .replace(/\[CARD:\d+\]/g, "")
    .replace(/\[END\]/g, "")
    .replace(/\[RECO:[a-z0-9_:]+\]/gi, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...cleaned];
  return chars.length > 90 ? chars.slice(0, 90).join("") + "…" : cleaned;
}
