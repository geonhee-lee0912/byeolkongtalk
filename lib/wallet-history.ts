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
  // 운세·스킬이 실패해 돌려준 별(charge · fortune_refund_* / *_refund)
  if (s.startsWith("fortune_refund_") || s.endsWith("_refund")) return "별 돌려받음";
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

/** 내역에 보일 별 수(부호 포함) — 사용(spend)과 앱 결제 환불 회수(refund — clawback_stars 가 거둔 양을 양수로 남긴다)는 빠진 별, 나머지는 들어온 별 */
export function starTxSignedAmount(type: string, amount: number): number {
  return type === "spend" || type === "refund" ? -Math.abs(amount) : Math.abs(amount);
}

/** 내역에서 뺄 줄 — 거둔 게 0 인 환불 행(잔액이 0 일 때의 환불 · 회수 멱등 기준 행)은 '-0 환불'로 보일 뿐이다 */
export function isHiddenStarTx(type: string, amount: number): boolean {
  return type === "refund" && amount === 0;
}

/** 묶음 제목 — 올해면 'M월 D일', 다른 해면 'YYYY년 M월 D일'(기기 시간대 — 줄의 시각 표기와 같은 기준) */
export function historyDayLabel(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === new Date(nowMs).getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

// ── 결제 줄 + 별 충전 줄 합치기 ─────────────────────────────────────────
// 결제 1번은 payments 한 행 + star_transactions 'charge · pg' 한 행(payment_id = payments.id)으로 남아
// 내역에 두 줄로 보였다(운영자 11-22 '이거까지 해결'). 결제 번호로 짝지어 결제 줄 하나에 싣는다.
// 운영 읽기 확인(11-22): 보이는 완료 결제는 전부 짝이 정확히 하나(별 수 같음 · 10분 안) — 짝 없는 건 탈퇴 익명 행뿐.
// 짝이 없으면(대기·환불 결제, 모르는 충전) 각자 그대로 둔다 — 줄이 사라지지 않는 쪽으로 실패한다.
export interface HistoryPayment {
  id: string;
  packageLabel: string;
  stars: number;
  amount: number;
  status: "pending" | "completed" | "refunded";
  paidAt: number;
}
export interface HistoryStarTx {
  id: string;
  type: string;
  typeLabel: string;
  signedAmount: number;
  balanceAfter: number;
  source: string;
  /** 'charge · pg' 일 때만 — 짝지을 payments.id */
  paymentId?: string | null;
  createdAt: number;
}
export type HistoryRow =
  | { kind: "payment"; id: string; time: number; payment: HistoryPayment; charge: HistoryStarTx | null }
  | { kind: "star"; id: string; time: number; tx: HistoryStarTx };

export function mergeHistory(payments: HistoryPayment[], txs: HistoryStarTx[]): HistoryRow[] {
  const chargeByPayment = new Map<string, HistoryStarTx>();
  for (const t of txs) {
    if (t.type === "charge" && t.source === "pg" && t.paymentId && !chargeByPayment.has(t.paymentId)) {
      chargeByPayment.set(t.paymentId, t);
    }
  }
  const used = new Set<string>();
  const rows: HistoryRow[] = payments.map((p) => {
    const c = chargeByPayment.get(p.id) ?? null;
    if (c) used.add(c.id);
    return { kind: "payment", id: `p-${p.id}`, time: p.paidAt, payment: p, charge: c };
  });
  for (const t of txs) {
    if (!used.has(t.id)) rows.push({ kind: "star", id: `s-${t.id}`, time: t.createdAt, tx: t });
  }
  return rows.sort((a, b) => b.time - a.time);
}
