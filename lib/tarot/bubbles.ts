// 타로 assistant 메시지 → 채팅 버블 파싱 — reading 라이브 스트림과 result 다시보기가 공유.
// [CARD:n] 마커 직후 버블에만 카드 이미지를 붙인다 (showCardImage).
import { RECO_MARKER_REGEX, stripRecoMarkers } from "@/lib/reco-utils";

export const CARD_MARKER_REGEX = /\[CARD:(\d+)\]/g;
export const END_MARKER_REGEX = /\[END\]/gi;
// 미완성 마커 (e.g., "[CA", "[CARD:", "[CARD:1", "[E", "[EN", "[END", "[RECO:", "[RECO:saju") 제거용 — 버블 깜빡임 방지
export const TRAILING_PARTIAL_MARKER =
  /\[(?:C(?:A(?:R(?:D(?::\d*)?)?)?)?|E(?:N(?:D)?)?|R(?:E(?:C(?:O(?::[a-z0-9_:]*)?)?)?)?)?$/;

export interface Bubble {
  text: string;
  cardIndex: number | null;
  showCardImage: boolean;
}

/** 원문 버퍼를 문단 + [CARD:n] 마커 기준으로 버블 배열로 파싱 */
export function parseIntoBubbles(raw: string): Bubble[] {
  const bubbles: Bubble[] = [];
  // RECO 마커는 파싱 전 원본에서 감지(parseRecoMarker) 가능하도록 raw 는 보존.
  // 표시 텍스트에서만 제거한다.
  const cleaned = stripRecoMarkers(
    raw
      .replace(TRAILING_PARTIAL_MARKER, "")
      .replace(END_MARKER_REGEX, "")
  );
  // RECO_MARKER_REGEX 는 lastIndex 를 공유하지 않도록 stripRecoMarkers 내부에서 처리됨.
  RECO_MARKER_REGEX.lastIndex = 0;
  const tokens = cleaned.split(/(\[CARD:\d+\])/g);
  let currentCardIndex: number | null = null;
  let nextIsFirstInSection = false;

  for (const token of tokens) {
    const markerMatch = /^\[CARD:(\d+)\]$/.exec(token);
    if (markerMatch) {
      currentCardIndex = parseInt(markerMatch[1], 10) - 1;
      nextIsFirstInSection = true;
      continue;
    }
    const paras = token
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of paras) {
      bubbles.push({
        text: p,
        cardIndex: currentCardIndex,
        showCardImage: nextIsFirstInSection,
      });
      nextIsFirstInSection = false;
    }
  }
  return bubbles;
}

/** 버퍼에서 가장 최근에 등장한 [CARD:n] 의 n 반환 (1-based) */
export function getLatestCardIndex(text: string): number | null {
  let lastMatch: RegExpExecArray | null = null;
  const regex = new RegExp(CARD_MARKER_REGEX.source, "g");
  let m;
  while ((m = regex.exec(text)) !== null) {
    lastMatch = m;
  }
  return lastMatch ? parseInt(lastMatch[1], 10) : null;
}
