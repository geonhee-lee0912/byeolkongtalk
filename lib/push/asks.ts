// 알림·광고 동의를 다시 물을지 — 순수 함수(테스트 asks.test.ts). 설계 §4-2·§4-3.
// 묻는 일은 모두 앱 화면 안에서만 한다(동의를 받으려고 보내는 푸시는 그 자체가 동의 없는 광고, p.12).

export type AskMoment = "first_reading_end" | "second_launch" | "reading_end" | "byeolmaru_first" | "birthday";
export const ASK_MOMENTS: readonly AskMoment[] = ["first_reading_end", "second_launch", "reading_end", "byeolmaru_first", "birthday"];
/** 첫 질문 — 첫 상담 끝 시트, 또는 첫 상담을 못 끝낸 회원의 두 번째 실행 시트 */
const FIRST: readonly AskMoment[] = ["first_reading_end", "second_launch"];

export type AskKind = "push" | "ad";
export type AskAnswer = "accepted" | "later" | "os_denied";
export type AskRecord = { moment: AskMoment; kind: AskKind; answer: AskAnswer };

/** 앱이 알려 준 OS 권한(웹 PushState 와 같다). denied = 다시 못 묻는 거부 */
export type OsState = "granted" | "denied" | "undetermined";
/** 광고 동의 — none 은 한 번도 동의 안 함, withdrawn 은 철회 */
export type AdStatus = "none" | "granted" | "withdrawn";

/** 첫 질문 뒤 다시 묻는 상한(거절 종류별) */
export const REASK_MAX = 2;

/** 알림 켜기(①)를 다시 물을 수 있는 순간 / 광고 동의만(②) 물을 수 있는 순간 */
const PUSH_REASK: readonly AskMoment[] = ["reading_end", "byeolmaru_first"];
const AD_REASK: readonly AskMoment[] = ["byeolmaru_first", "birthday"];

/** 이 순간에 물을 것. 'push' = 알림 켜기 시트(광고 미동의면 체크칸 포함), 'ad' = 광고 동의만, null = 묻지 않는다.
 *  ③ OS 거부는 여기서 묻지 않는다 — 다시 볼 날을 고를 때 그 자리 안내 한 줄로만(RevisitSheet)
 *  ④ 철회한 사람에게 광고를 먼저 묻지 않는다 — 알림 설정에서 스스로 켤 수만 있다 */
export function nextAsk(i: {
  moment: AskMoment;
  os: OsState;
  ad: AdStatus;
  /** 유료 구독 중 — 아침 별 흐름이 정보성으로 이미 가니, 별마루에서 광고를 물을 까닭이 없다 */
  subscriber: boolean;
  asks: AskRecord[];
}): AskKind | null {
  // 각 순간은 한 사람에게 한 번씩만
  if (i.asks.some((a) => a.moment === i.moment)) return null;
  const askedFirst = i.asks.some((a) => FIRST.includes(a.moment));
  if (FIRST.includes(i.moment)) {
    if (askedFirst) return null;
    // 두 번째 실행 시트는 다시 볼 날이 없다 — 알림이 이미 켜져 있고 광고도 정한(동의·철회) 사람에겐 물을 게 없다.
    // 첫 상담 끝 시트는 다시 볼 날 고르기가 본체라 늘 연다(단계 1 그대로)
    if (i.moment === "second_launch" && i.os === "granted" && i.ad !== "none") return null;
    return "push";
  }
  // 다시 묻기는 첫 질문의 거절 뒤에만
  if (!askedFirst) return null;
  if (i.os === "denied") return null;
  const reasked = (k: AskKind) => i.asks.filter((a) => !FIRST.includes(a.moment) && a.kind === k).length;
  if (i.os === "undetermined") {
    // ① '나중에'(또는 안드로이드 첫 거부처럼 다시 물을 수 있는 거부)
    if (!PUSH_REASK.includes(i.moment) || reasked("push") >= REASK_MAX) return null;
    return "push";
  }
  // os granted — ② 알림은 허용, 광고만 미동의
  if (i.ad !== "none") return null;
  if (!AD_REASK.includes(i.moment) || reasked("ad") >= REASK_MAX) return null;
  if (i.moment === "byeolmaru_first" && i.subscriber) return null;
  return "ad";
}
