/** 정보성 알림 문구에 들어가면 안 되는 판촉 단어 (테스트가 지킨다). */
export const PROMO_WORDS = ["별", "충전", "할인", "체험", "출석", "구독", "무료", "이벤트"];

export function revisitMessage(): { title: string; body: string } {
  return { title: "다시 볼 날이야", body: "그때 그 리딩, 오늘 다시 펼쳐 볼래?" };
}

/** 리딩 열람 경로. 지원하지 않는 상담 종류는 null. */
export function readingPath(consultationType: string, readingId: string): string | null {
  const id = encodeURIComponent(readingId);
  if (consultationType === "tarot") return `/tarot/result?id=${id}`;
  if (consultationType === "saju") return `/saju/result?id=${id}`;
  return null;
}
