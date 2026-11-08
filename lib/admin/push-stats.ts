// 알림 성과 어드민 — RPC 행(admin_push_*) → 화면 표. 순수(테스트 push-stats.test.ts).
// PostgREST 는 BIGINT 를 문자열로 줄 수 있어 숫자는 전부 Number() 를 거친다. 비율은 pct1(분모 0 → null = "잴 수 없음").
import { pct1 } from "./layer1.ts";

// ── 라벨(단일 원천). 🔴 매핑에 없는 값은 원본 키를 그대로 보인다 — 새 종류가 화면보다 먼저 데이터에 나타난다 ──
export const MOMENT_LABEL: Record<string, string> = {
  first_reading_end: "첫 상담 끝",
  second_launch: "두 번째 실행",
  reading_end: "다음 리딩 끝(다시 묻기)",
  byeolmaru_first: "별마루 첫 방문",
  birthday: "사주 첫 방문",
};
export const SOURCE_LABEL: Record<string, string> = {
  ...MOMENT_LABEL,
  settings: "알림 설정",
  unsubscribe_button: "알림의 [수신거부] 버튼",
  unsubscribe_line: "열린 화면의 철회 줄",
  reconfirm_popup: "2년 재확인 팝업",
  reconfirm_push: "2년 재확인 알림",
};
export const KIND_LABEL: Record<string, string> = {
  revisit: "다시 볼 날",
  reconfirm: "2년 재확인",
  morning: "아침 별 흐름",
  resume: "이어가기",
  wake: "깨우기",
};
export const label = (map: Record<string, string>, key: string): string => map[key] ?? key;

const n = (v: unknown): number => Number(v ?? 0) || 0;
/** 라벨 순서대로, 모르는 키는 맨 뒤 */
const rank = (order: string[], key: string): number => {
  const i = order.indexOf(key);
  return i < 0 ? order.length : i;
};

export type AskRow = { moment: string; kind: string; answer: string; cnt: number | string; users: number | string };
export type ConsentRow = { event: string; source: string; cnt: number | string; users: number | string };
export type SendRow = {
  day: string; kind: string; klass: string;
  /** 보냄 = 한 기기 이상에 나간 발송. claimed = 선점 전체(진행 중·멈춘 것 포함) — 차이가 크면 발송이 멈춘 것 */
  sent: number | string; claimed: number | string; opened: number | string; unsubscribed: number | string;
};
export type RevisitRow = { status: string; gap_days: number | string; cnt: number | string; users: number | string };

/** 묻는 순간 × 종류별 — 받아들임·나중에·휴대폰 거부와 허용률(받아들임 / 전체) */
export function askTable(rows: AskRow[]) {
  const by = new Map<string, { moment: string; kind: string; accepted: number; later: number; osDenied: number; total: number }>();
  for (const r of rows) {
    const k = `${r.moment}|${r.kind}`;
    const e = by.get(k) ?? { moment: r.moment, kind: r.kind, accepted: 0, later: 0, osDenied: 0, total: 0 };
    const c = n(r.cnt);
    if (r.answer === "accepted") e.accepted += c;
    else if (r.answer === "later") e.later += c;
    else if (r.answer === "os_denied") e.osDenied += c;
    e.total += c;
    by.set(k, e);
  }
  const order = Object.keys(MOMENT_LABEL);
  return [...by.values()]
    .sort((a, b) => rank(order, a.moment) - rank(order, b.moment) || a.kind.localeCompare(b.kind))
    .map((e) => ({ ...e, acceptRate: pct1(e.accepted, e.total) }));
}

/** 순간(source)별 — 광고 동의·철회 수. 동의율은 '그 순간에 물은 수' 대비(묻는 기록이 있는 순간만) */
export function consentTable(rows: ConsentRow[], asks: AskRow[]) {
  const asked = new Map<string, number>();
  for (const a of asks) asked.set(a.moment, (asked.get(a.moment) ?? 0) + n(a.cnt));
  const by = new Map<string, { source: string; grant: number; withdraw: number }>();
  for (const r of rows) {
    if (r.event !== "grant" && r.event !== "withdraw") continue;
    const e = by.get(r.source) ?? { source: r.source, grant: 0, withdraw: 0 };
    e[r.event] += n(r.cnt);
    by.set(r.source, e);
  }
  return [...by.values()]
    .sort((a, b) => b.grant + b.withdraw - (a.grant + a.withdraw) || a.source.localeCompare(b.source))
    .map((e) => ({ ...e, asked: asked.get(e.source) ?? null, grantRate: asked.has(e.source) ? pct1(e.grant, asked.get(e.source) ?? 0) : null }));
}

/** 종류 × 정보성/광고 합계 — 열람률(누르고 연 것 / 보낸 것)·수신거부율(광고만 의미).
 *  수신거부 = 그 알림의 수신거부 표를 쓴 수 — 이미 철회한 뒤 옛 알림의 표를 써도 센다. 실제 철회 수는 동의·철회 표의 '철회' */
export function sendTotals(rows: SendRow[]) {
  const by = new Map<string, { kind: string; klass: string; sent: number; opened: number; unsubscribed: number }>();
  for (const r of rows) {
    const k = `${r.kind}|${r.klass}`;
    const e = by.get(k) ?? { kind: r.kind, klass: r.klass, sent: 0, opened: 0, unsubscribed: 0 };
    e.sent += n(r.sent);
    e.opened += n(r.opened);
    e.unsubscribed += n(r.unsubscribed);
    by.set(k, e);
  }
  const order = Object.keys(KIND_LABEL);
  return [...by.values()]
    .sort((a, b) => rank(order, a.kind) - rank(order, b.kind) || a.klass.localeCompare(b.klass))
    .map((e) => ({ ...e, openRate: pct1(e.opened, e.sent), unsubRate: e.klass === "ad" ? pct1(e.unsubscribed, e.sent) : null }));
}

/** 날짜별 보낸 수(종류 합) — 최근 날짜가 위 */
export function sendsByDay(rows: SendRow[]) {
  const by = new Map<string, { day: string; info: number; ad: number; opened: number }>();
  for (const r of rows) {
    const e = by.get(r.day) ?? { day: r.day, info: 0, ad: 0, opened: 0 };
    if (r.klass === "ad") e.ad += n(r.sent);
    else e.info += n(r.sent);
    e.opened += n(r.opened);
    by.set(r.day, e);
  }
  return [...by.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** 다시 볼 날 — 상태별 수와 '그날 보냄' 비율(보냄 / (보냄 + 건너뜀)), 고른 간격 분포 */
export function revisitSummary(rows: RevisitRow[]) {
  const status = { pending: 0, sent: 0, skipped: 0 };
  const gaps = new Map<number, number>();
  for (const r of rows) {
    const c = n(r.cnt);
    if (r.status === "pending" || r.status === "sent" || r.status === "skipped") status[r.status] += c;
    gaps.set(n(r.gap_days), (gaps.get(n(r.gap_days)) ?? 0) + c);
  }
  const total = status.pending + status.sent + status.skipped;
  return {
    ...status,
    total,
    deliveredRate: pct1(status.sent, status.sent + status.skipped),
    gaps: [...gaps.entries()].sort((a, b) => a[0] - b[0]).map(([days, cnt]) => ({ days, cnt })),
  };
}
