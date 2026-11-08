/** 정보성 알림 문구에 들어가면 안 되는 판촉 단어 (테스트가 지킨다). */
export const PROMO_WORDS = ["별", "충전", "할인", "체험", "출석", "구독", "무료", "이벤트"];

/** 이름 속 글자는 판촉이 아니다 — 서비스·캐릭터 이름을 지운 뒤 판촉 단어를 찾는다("별콩톡"의 '별'은 재화 '별'이 아니다) */
const BRAND_NAMES = ["별콩톡", "별콩이", "별마루"];

/** 문구에 든 판촉 단어(없으면 빈 배열) — 정보성 틀 계약 테스트가 쓴다 */
export function promoWordsIn(text: string): string[] {
  const stripped = BRAND_NAMES.reduce((t, n) => t.split(n).join(""), text);
  return PROMO_WORDS.filter((w) => stripped.includes(w));
}

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

/** 2년 재확인 통지(정보성 — 동의 여부 확인 안내는 광고가 아니다, Q&A 08-06). 전송자 명칭·동의 사실과 날짜·유지·철회 방법(pp.25–26).
 *  🔴 판촉을 한 줄도 섞지 않는다 — 섞이면 이 알림 전체가 광고가 된다 */
export function reconfirmMessage(grantedOn: string): { title: string; body: string } {
  return {
    title: "광고 수신 동의 확인 안내",
    body: `${grantedOn}에 동의한 별콩톡 광고성 정보(앱 푸시) 수신이 계속되고 있어. 그대로 두면 계속 받고, 그만 받으려면 마이 → 알림 설정에서 끌 수 있어.`,
  };
}

/** 알림 설정 화면 — 재확인 통지를 누르면 여기로 */
export const NOTIFICATION_SETTINGS_PATH = "/mypage/notifications";
