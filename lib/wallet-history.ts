// lib/wallet-history.ts — 마이 '결제·별 내역' 줄의 글귀(순수 · 클라 세이프).
// 디자인 다듬기 결제 내역 ⑧⑨ A(운영자 11-22): 예전엔 별 사용 줄이 전부 '사용'이라 무엇에 썼는지 몰랐다 —
// 서버가 이미 보내던 star_transactions.source 로 이름을 붙인다. 날짜는 묶음 제목('11월 21일')으로.
// 🔴 모르는 source 는 원문이 아니라 일반 이름 — 동적 키로 config 를 조회하다 undefined 를 렌더하는 클래스를 피한다(hasOwn).
import { FORTUNE_CONFIG } from "./fortune/types.ts";

const SPEND_LABEL: Record<string, string> = {
  tarot_reading: "타로 상담",
  saju_reading: "사주 상담",
  clarifier: "카드 한 장 더",
  extend: "별콩이랑 더 얘기하기",
  byeolmaru_subscription: "별마루 구독",
  admin_adjust: "별 조정",
};
const CHARGE_LABEL: Record<string, string> = {
  pg: "별 충전",
  welcome_bonus: "첫 방문 선물",
  first_charge_bonus: "첫 충전 보너스",
  survey_reward: "설문 선물",
  admin_adjust: "별 조정",
};
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function starTxLabel(type: string, source: string | null): string {
  const s = source ?? "";
  if (type === "refund") return "환불";
  if (type === "bonus") return has(CHARGE_LABEL, s) ? CHARGE_LABEL[s] : "보너스";
  if (type === "spend") {
    if (has(SPEND_LABEL, s)) return SPEND_LABEL[s];
    if (s.startsWith("fortune_")) {
      const t = s.slice("fortune_".length);
      return has(FORTUNE_CONFIG, t) ? FORTUNE_CONFIG[t as keyof typeof FORTUNE_CONFIG].label : "사주 운세";
    }
    if (s.startsWith("relationship_") || s.startsWith("rel_")) return "우리 사이";
    return "별 사용";
  }
  return has(CHARGE_LABEL, s) ? CHARGE_LABEL[s] : "별 받음";
}

/** 묶음 제목 — 올해면 'M월 D일', 다른 해면 'YYYY년 M월 D일'(기기 시간대 — 줄의 시각 표기와 같은 기준) */
export function historyDayLabel(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === new Date(nowMs).getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}
