import { kstDate } from "../admin-time.ts";

export type RevisitChoice = "3d" | "1w" | "2w";

export const REVISIT_DAYS: Record<RevisitChoice, number> = { "3d": 3, "1w": 7, "2w": 14 };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 보낼 창: 그날 08:30 이상, 21:00 미만 (KST, 분 단위) */
const OPEN_MIN = 8 * 60 + 30;
const CLOSE_MIN = 21 * 60;

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 고른 칩 → 보낼 날(KST, YYYY-MM-DD). 고른 순간의 KST 날짜 기준. */
export function revisitSendOn(choice: RevisitChoice, now: Date): string {
  return addDays(kstDate(now.toISOString()), REVISIT_DAYS[choice]);
}

/** 달력으로 고를 수 있는 날 — 내일부터 30일 뒤까지(KST). 오늘은 아침 발송이 이미 지났을 수 있어 뺀다 */
export const REVISIT_MAX_DAYS = 30;
export function revisitDateRange(now: Date): { min: string; max: string } {
  const today = kstDate(now.toISOString());
  return { min: addDays(today, 1), max: addDays(today, REVISIT_MAX_DAYS) };
}

/** 달력에서 고른 날(YYYY-MM-DD) → 보낼 날. 없는 날·범위 밖이면 null */
export function revisitSendOnFromDate(date: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (addDays(date, 0) !== date) return null; // 2026-11-31 같은 없는 날은 넘어가 다른 날이 된다
  const { min, max } = revisitDateRange(now);
  return date >= min && date <= max ? date : null;
}

/** early: 아직 / open: 지금 보낼 수 있음 / missed: 놓침(미루지 않고 건너뜀) */
export function revisitWindow(sendOn: string, now: Date): "early" | "open" | "missed" {
  const today = kstDate(now.toISOString());
  if (today < sendOn) return "early";
  if (today > sendOn) return "missed";
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const min = k.getUTCHours() * 60 + k.getUTCMinutes();
  if (min < OPEN_MIN) return "early";
  if (min >= CLOSE_MIN) return "missed";
  return "open";
}
