// lib/byeolmaru/hub-today.ts — 별마루 첫 화면 맨 위 '오늘 나' 칸의 글귀(순수 · 클라 세이프).
// 디자인 다듬기 별마루 ①H3(운영자 11-21): 큰 배너(제목 '별마루'가 앱 머리와 두 번)를 사주 운세 탭의 '내 사주' 칸과
// 같은 흰 카드로 바꿨다 — 윗줄 = 오늘(옛 달력 판 첫 줄 TodayLead 를 올림), 아랫줄 = 허브의 유일한 구독 자리(옛 배너 버튼).
import { TRIAL_DAYS } from "./constants";
import { daysLeft } from "./subscribe-offer";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 윗줄 두 줄. 연속은 2일부터(1일은 '연속'이라 부를 게 없다 — 옛 TodayLead 와 같은 규칙). */
export function hubTodayLines(input: {
  /** KST 오늘 'YYYY-MM-DD' */
  today: string;
  todayName: string | null;
  todayScore: number | null;
  streak: number | null;
}): { title: string; sub: string } {
  const { today, todayName, todayScore, streak } = input;
  const [y, m, d] = today.split("-").map(Number);
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const title = todayName ? `오늘${todayScore !== null ? ` ${todayScore}점` : ""} · ${todayName}` : "오늘의 흐름";
  // 요일은 '(토)' 로 짧게 — '토요일' 이면 앱 폭 390 에서 연속 줄이 잘렸다(실측 11-21)
  const date = `${m}월 ${d}일 (${weekday})`;
  return { title, sub: streak !== null && streak > 1 ? `${date} · ${streak}일 연속 들르는 중` : date };
}

/** 아랫줄 — 자격 상태별 글과 칩. action 이 null 이면 누를 게 없는 정보 칩(구독·체험 중).
 *  🔴 D-n 은 subscribe-offer 의 daysLeft — 체험 넛지와 같은 잣대(옛 HubBanner 칩과 같은 규칙). */
export function hubSubscribeLine(input: {
  entitled: boolean;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
  trialEndsAt: string | null;
  now: number;
}): { text: string; chip: string; action: "trial" | "subscribe" | null } {
  const { entitled, trialUsed, subscriptionExpiresAt, trialEndsAt, now } = input;
  if (entitled) {
    const expiry = subscriptionExpiresAt ?? trialEndsAt;
    return {
      text: "사주·타로·우리를 끝까지 볼 수 있어",
      chip: `${subscriptionExpiresAt ? "구독 중" : "체험 중"}${expiry ? ` · D-${daysLeft(expiry, now)}` : ""}`,
      action: null,
    };
  }
  if (trialUsed) return { text: "구독하면 사주·타로·우리를 끝까지 봐", chip: "구독하기", action: "subscribe" };
  return { text: `${TRIAL_DAYS}일 동안 사주·타로·우리를 끝까지 봐`, chip: `${TRIAL_DAYS}일 무료 체험`, action: "trial" };
}
