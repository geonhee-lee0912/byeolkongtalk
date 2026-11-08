// 앱 헤더가 쓰는 화면 판정 — 탭 첫 화면인지, 하위 화면이면 제목과 '‹' 가 기록 없이 갈 탭. 스펙 2026-11-07-앱-화면 §4.
// 탭 첫 화면은 정확히 일치할 때만이다(하단 탭 불 켜기용 BottomTab matchPrefixes 와 별개).

import type { AppTabRoot } from "../app-bridge/protocol.ts";

/** 탭 첫 화면 — 목록의 원천은 lib/app-bridge/protocol.ts APP_TAB_ROOTS(앱의 당겨서 새로고침도 같은 목록을 쓴다) */
export type TabRoot = AppTabRoot;
export type AppScreen = { kind: "tab"; title: string } | { kind: "sub"; title: string; tabRoot: TabRoot };

const TABS: Record<TabRoot, string> = {
  "/": "타로톡",
  "/fortune": "사주 운세",
  "/byeolmaru": "별마루",
  "/shop": "별콩 상점",
  "/mypage": "마이",
};

/** [접두사, 제목, 탭] — 경로 조각 단위로 맞추고 가장 긴 접두사가 이긴다 */
const SUBS: [string, string, TabRoot][] = [
  ["/tarot/result", "타로 결과", "/"],
  ["/tarot/reading", "타로 풀이", "/"],
  ["/tarot/draw", "타로 카드 뽑기", "/"],
  ["/saju/result", "사주 결과", "/"],
  ["/saju/reading", "사주 풀이", "/"],
  ["/saju/concern", "사주 고민 적기", "/"],
  ["/concern", "고민 적기", "/"],
  ["/relationship", "연애 상담", "/"],
  ["/how-to-use", "별콩이 사용 방법", "/"],
  ["/guide", "타로 가이드", "/"],
  ["/free/daily-card", "오늘의 카드", "/"],
  ["/survey", "별콩이의 질문", "/"],
  ["/fortune", "사주 운세", "/fortune"],
  ["/fortune/result", "운세 리포트", "/fortune"],
  ["/fortune/saju-mbti", "사주 MBTI", "/fortune"],
  ["/fortune/byeoljari", "인연 별자리", "/fortune"],
  ["/fortune/compat", "궁합", "/fortune"],
  ["/fortune/daily", "오늘의 운세", "/fortune"],
  ["/byeolmaru/day", "그날의 흐름", "/byeolmaru"],
  ["/byeolmaru/saju", "오늘 사주", "/byeolmaru"],
  ["/byeolmaru/tarot", "오늘 타로", "/byeolmaru"],
  ["/byeolmaru/woori", "우리 사이", "/byeolmaru"],
  ["/mypage/notifications", "알림 설정", "/mypage"],
  ["/push/unsubscribe", "광고 수신거부", "/mypage"],
  ["/mypage/payments", "결제·별 내역", "/mypage"],
  ["/mypage/support", "문의 내용", "/mypage"],
  ["/mypage/support/new", "문의 남기기", "/mypage"],
  ["/mypage/legal", "약관·사업자 정보", "/mypage"],
  ["/readings", "보관함", "/mypage"],
  ["/terms", "이용약관", "/mypage"],
  ["/privacy", "개인정보처리방침", "/mypage"],
  ["/refund", "환불정책", "/mypage"],
];
/** 접두사 표의 예외 — 정확히 이 경로일 때만(문의 목록은 '고객센터', 그 아래 상세는 '문의 내용') */
const EXACT: Record<string, [string, TabRoot]> = {
  "/mypage/support": ["고객센터", "/mypage"],
};

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
}

export function appScreen(pathname: string): AppScreen {
  const path = normalize(pathname);
  if (path in TABS) return { kind: "tab", title: TABS[path as TabRoot] };
  const exact = EXACT[path];
  if (exact) return { kind: "sub", title: exact[0], tabRoot: exact[1] };
  let best: [string, string, TabRoot] | null = null;
  for (const row of SUBS) {
    const p = row[0];
    if ((path === p || path.startsWith(p + "/")) && (!best || p.length > best[0].length)) best = row;
  }
  return best ? { kind: "sub", title: best[1], tabRoot: best[2] } : { kind: "sub", title: "별콩톡", tabRoot: "/" };
}

/** 앱 안 기록 깊이 — '‹' 가 뒤로 갈 수 있는지(0 이면 탭 첫 화면으로 바꿔 연다) */
export function nextDepth(depth: number, ev: "push" | "pop"): number {
  return ev === "push" ? depth + 1 : Math.max(0, depth - 1);
}

/** 주소(경로+쿼리)가 바뀔 때의 기록 깊이 — 쿼리만 바뀐 이동도 기록 한 칸이다. prevKey 가 없으면(첫 화면) 그대로 */
export function depthOnChange(depth: number, prevKey: string | null, key: string, popped: boolean): number {
  if (prevKey === null || prevKey === key) return depth;
  return nextDepth(depth, popped ? "pop" : "push");
}
