// 광고 알림 문구 틀 — 정보성 틀(templates.ts)과 다른 파일·다른 함수다(설계 §5-4). 광고는 이 파일의 함수로만 만든다.
// 규칙(계약 테스트 ad-templates.test.ts): 제목·본문 맨 앞 "(광고)", 본문 끝에 무료 수신거부 안내와 고객센터 연락처.
// "[광고]"·"(AD)" 같은 변칙 표기 금지(p.39, Q&A 06-03). 전송자 명칭은 앱 이름과 같아 생략(p.44). 고민 내용은 넣지 않는다.

/** 광고 알림 끝에 넣는 고객센터 연락처.
 *  🔴 임시 — 운영 배포 전 운영자가 정함(2026-11-08 임시값). 실제 번호로 바꾸기 전엔 운영에 내보내지 말 것 */
export const SUPPORT_CONTACT = "010-1234-5678";

export const AD_PREFIX = "(광고) ";
/** 본문 끝 줄 — 수신거부 방법(알림의 버튼, 무료)과 연락처 */
export const AD_FOOTER = `무료 수신거부: 알림의 [수신거부] 버튼 · 고객센터 ${SUPPORT_CONTACT}`;

/** 광고 틀 — 모든 광고 문구는 여기를 지난다 */
export function adMessage(title: string, body: string): { title: string; body: string } {
  return { title: AD_PREFIX + title, body: `${AD_PREFIX}${body}\n${AD_FOOTER}` };
}
