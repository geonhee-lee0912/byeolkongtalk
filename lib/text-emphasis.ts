// 별콩이 응답의 **강조** 마크다운을 버블에서 <strong> 으로 렌더하기 위한 순수 분할.
// 채팅 버블은 plain text 라 별표가 날것으로 노출되던 문제 대응 (2026-07-22).

export interface EmphasisSegment {
  text: string;
  bold: boolean;
}

/** 화면 밖으로 나가는 글(공유 글·카톡 설명·공유 그림)용 — 강조를 못 그리니 별표만 뺀다. 잘려서 짝이 없는 별표도 */
export function stripEmphasisMarks(text: string): string {
  return text.replace(/\*\*/g, "");
}

export function splitEmphasis(text: string): EmphasisSegment[] {
  const segments: EmphasisSegment[] = [];
  const re = /\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), bold: false });
    segments.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments.length ? segments : [{ text, bold: false }];
}
