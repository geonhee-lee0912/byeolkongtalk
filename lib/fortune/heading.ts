// 섹션 heading/preview 유틸 — GenericReportView·CollapsibleSection 공용.

/** 첫 그래핌(ZWJ·VS16 이모지 시퀀스 포함) 추출 — Intl.Segmenter, 미지원 시 코드포인트 폴백. */
export function firstGrapheme(s: string): string {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const g of seg.segment(s)) return g.segment;
  } catch {
    /* Intl.Segmenter 미지원 폴백 */
  }
  return [...s][0] ?? "";
}

/** heading 앞 이모지를 아이콘 타일용으로 분리. 이모지 없으면 기본 별(✦). */
export function splitHeadingEmoji(heading: string): { emoji: string; title: string } {
  const g = firstGrapheme(heading);
  const isEmoji = g !== "" && /\p{Extended_Pictographic}/u.test(g);
  if (isEmoji) return { emoji: g, title: heading.slice(g.length).trim() };
  return { emoji: "✦", title: heading };
}

/** 접힌 섹션 미리보기 한 줄 — 마크다운(볼드·불릿·콜아웃·줄바꿈) 걷어내고 첫 문장. (CSS line-clamp 로 최종 절단) */
export function sectionPreview(body: string): string {
  const plain = body
    .replace(/\*\*/g, "") // 볼드 마커
    .replace(/^\s*[>\-]\s?/gm, "") // 줄머리 불릿/콜아웃 마커
    .replace(/\s*\n+\s*/g, " ") // 줄바꿈 → 공백
    .trim();
  const m = plain.match(/^[^.!?…]*[.!?…]/); // 첫 문장 끝까지
  return (m ? m[0] : plain).trim();
}
