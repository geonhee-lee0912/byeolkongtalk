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
