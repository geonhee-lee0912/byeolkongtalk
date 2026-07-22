// 별콩이 응답의 **강조** 마크다운을 버블에서 <strong> 으로 렌더하기 위한 순수 분할.
// 채팅 버블은 plain text 라 별표가 날것으로 노출되던 문제 대응 (2026-07-22).

export interface EmphasisSegment {
  text: string;
  bold: boolean;
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
