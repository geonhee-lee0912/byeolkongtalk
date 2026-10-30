// 스프레드 분량 안내 — 스프레드 카드의 한 줄이 읽는 공통 표.
// 순수 함수(클라 안전). spec 2026-10-25-타로-원투카드-마무리-안내줄 §2-1·§4-2
import { SPREAD_INFO, type SpreadType } from "./spreads.ts";
import { WRAP_THRESHOLDS } from "./constants.ts";

/** 첫 풀이 분량(대략, 카드 수별). prod 9월~ 첫 답 중앙값: 1장 803 · 2장 1,189 · 3장 2,014 · 5장 3,061~3,554 · 7장 4,643~4,692자.
 *  6장은 prod 표본이 1건(3,792)뿐이라 페르소나 목표(3,500~4,200)·QA 평균(3,858)으로 잡았다.
 *  2026-10-25 재확인(9/1~ 새 리딩): 1장 812 · 2장 1,208 · 3장 2,044 · 5장 3,101~3,606 · 6장 3,840(1건) · 7장 4,707~4,748 — 표 그대로. */
const FIRST_ANSWER_CHARS: Record<number, number> = { 1: 800, 2: 1200, 3: 2000, 5: 3500, 6: 3800, 7: 4700 };

/** "~1,200자" — 첫 답 하나의 길이(대화 전체 분량이 아니다). 카드 수가 표에 없으면 던진다 */
export function firstAnswerChars(spreadType: SpreadType): string {
  return `~${FIRST_ANSWER_CHARS[SPREAD_INFO[spreadType].cardCount].toLocaleString("ko-KR")}자`;
}

/** 첫 풀이 뒤 자연 마무리선까지 받는 질문 수 — 첫 풀이가 1번째 답이라 hardCapTurn − 1.
 *  화면엔 '이상'으로 쓴다: 자연 마무리선에서 아직 묻고 있으면 열어 두고(keep-open) 강제 종료선까지 간다. */
export function followUpQuestions(spreadType: SpreadType): number {
  return WRAP_THRESHOLDS[spreadType].hardCapTurn - 1;
}

/** "첫 풀이 ~1,200자 · 질문 5번 이상" */
export function spreadAmountLine(spreadType: SpreadType): string {
  return `첫 풀이 ${firstAnswerChars(spreadType)} · 질문 ${followUpQuestions(spreadType)}번 이상`;
}
