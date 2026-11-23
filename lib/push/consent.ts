// 광고 동의의 날짜 규칙 — 순수 함수(테스트 consent.test.ts). 설계 §4-4(결과 통지 날짜)·§4-5(2년 재확인).
import { kstDate } from "../admin-time.ts";

/** 통지에 쓰는 날짜 — "오늘"이 아니라 `2026년 11월 8일`(KST) */
export function koreanDate(iso: string): string {
  const [y, m, d] = kstDate(iso).split("-");
  return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
}

const DAY_MS = 86_400_000;
/** 기한 30일 전부터 앱을 열면 팝업 */
export const RECONFIRM_POPUP_DAYS = 30;
/** 기한 7일 전까지 앱을 열지 않았으면 정보성 푸시 */
export const RECONFIRM_PUSH_DAYS = 7;

function addYears(iso: string, years: number): Date {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/** 2년 재확인 — 최초 동의일부터 2년마다(기산점은 알린 날로 새로 잡히지 않는다, Q&A 08-15).
 *  아직 알리지 않은 가장 이른 기한을 찾는다: 그 기한의 30일 전 이후에 남긴 통지가 있으면 그 기한은 알린 것이다.
 *  popup = 지금 앱을 열면 팝업, push = cron 이 정보성 푸시를 보낼 때 */
export function reconfirmState(
  firstGrantedAt: string,
  lastNoticeAt: string | null,
  now: Date,
): { deadline: string; popup: boolean; push: boolean } {
  let n = 1;
  let deadline = addYears(firstGrantedAt, 2);
  const last = lastNoticeAt ? new Date(lastNoticeAt).getTime() : null;
  while (last !== null && last >= deadline.getTime() - RECONFIRM_POPUP_DAYS * DAY_MS) {
    n += 1;
    deadline = addYears(firstGrantedAt, 2 * n);
  }
  const t = now.getTime();
  const popup = t >= deadline.getTime() - RECONFIRM_POPUP_DAYS * DAY_MS;
  const push = t >= deadline.getTime() - RECONFIRM_PUSH_DAYS * DAY_MS;
  return { deadline: deadline.toISOString(), popup, push };
}
