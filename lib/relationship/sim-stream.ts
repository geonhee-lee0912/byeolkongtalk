// lib/relationship/sim-stream.ts — 밤 무대 클라 스트리밍 소비 보조(순수). 완성 텍스트 스트립은 lib/relationship/sim.ts 의 stripSimMarkers.
// 여기선 "스트리밍 중" 화면 표시용으로 [SEND: 꼬리(완성/미완성)를 숨겨 깜빡임을 막는다.
// `[SEND:` 로 시작하는 온전한/부분 마커가 문자열 끝부분에 나타나면 그 지점부터 잘라낸다.
const SEND_TAIL_RE = /\[(?:S(?:E(?:N(?:D(?::[^\]]*)?)?)?)?)?$/;

/** 스트리밍 중 표시 텍스트에서 끝에 걸친 [SEND:...] (완성/미완성)를 숨긴다. 중간의 완성 마커도 제거. */
export function hideTrailingSendMarker(text: string): string {
  // 완성 마커 먼저 제거(디브리핑 외 방어적), 그다음 끝에 걸친 부분 마커 컷.
  return text
    .replace(/\[SEND:[^\]]*\]/g, "")
    .replace(SEND_TAIL_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
