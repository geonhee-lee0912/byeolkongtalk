// 이어가기·깨우기 판정 — 순수 함수(테스트 comeback.test.ts). 설계 §3 C·§5-2·§5-3·§7(단계 4).
// 둘 다 광고(C)라 공통 판정(decide.ts)의 동의·도착 창·하루 2·위기 신호 30일을 그대로 지난다.
import { kstDate } from "../admin-time.ts";
import { decidePush, kstMinutes, type Decision, type Slot, type Subscription } from "./decide.ts";
import { MORNING_CLOSE_MIN, MORNING_OPEN_MIN } from "./morning.ts";

/** 저녁 알림은 19:00 발송(§5-2). 광고 창이 20:30 에 닫히니 그 전까지 */
export const EVENING_OPEN_MIN = 19 * 60;

const DAY_MS = 86_400_000;

function daysBetweenKst(fromIso: string, now: Date): number {
  const a = Date.parse(kstDate(fromIso) + "T00:00:00Z");
  const b = Date.parse(kstDate(now.toISOString()) + "T00:00:00Z");
  return Math.round((b - a) / DAY_MS);
}

type Common = {
  now: Date;
  activeDevices: number;
  subscription: Subscription;
  adConsent: boolean;
  adSentToday: Slot[];
  crisisWithin30d: boolean;
};

// ── 하던 이야기 이어가기 — 대화 도중 나간 다음 날 저녁 1회 ─────────────────────

export type ResumeInput = Common & {
  /** 가장 최근의 (운세가 아닌) 타로 상담 — 홈 이어가기 버튼과 같은 대상 */
  reading: { ended: boolean; lastUserAt: string | null } | null;
};

export type ResumeDecision = Decision | { send: false; reason: "window" | "no_reading" | "not_yesterday" };

export function decideResume(i: ResumeInput): ResumeDecision {
  const m = kstMinutes(i.now);
  if (m < EVENING_OPEN_MIN) return { send: false, reason: "window" };
  // 끝까지 간 대화([END])는 이어갈 게 없다. 사용자가 한 마디도 안 한 상담은 '대화 도중'이 아니다
  if (!i.reading || i.reading.ended || !i.reading.lastUserAt) return { send: false, reason: "no_reading" };
  // 마지막 말이 '어제'(KST)일 때만 — 오늘 다시 왔으면(오늘 말함) 이미 돌아온 것, 그제 이전이면 '다음 날'이 지났다
  if (daysBetweenKst(i.reading.lastUserAt, i.now) !== 1) return { send: false, reason: "not_yesterday" };
  return decidePush({ kind: "resume", prefOn: true, ...pick(i) });
}

// ── 조용한 사람 깨우기 — 7일 미접속에 1회, 14일에 1회 더 ─────────────────────────

export const WAKE_STEPS = [7, 14] as const;
export type WakeStep = (typeof WAKE_STEPS)[number];
/** 한 단계가 유효한 기간 — cron 이 밀려도 하루 이틀은 늦게 보낸다. 그 뒤엔 보내지 않는다(묵은 깨우기) */
const WAKE_GRACE_DAYS = 7;

/** 이번 미접속(마지막으로 연 날)의 깨우기 표식 — 같은 미접속엔 단계마다 한 번 */
export function wakeRef(lastOpenAt: string, step: WakeStep): string {
  return `${kstDate(lastOpenAt)}:${step}`;
}

export type WakeInput = Common & {
  lastOpenAt: string | null;
  /** 아침 별 흐름을 받는 사람 — 깨우기는 받지 않는 동의자에게만(§5-3) */
  receivesMorning: boolean;
  /** 이미 보낸 깨우기 표식(wakeRef) */
  wakeRefsSent: string[];
};

export type WakeDecision =
  | { send: true; klass: "ad"; step: WakeStep; ref: string }
  | Exclude<Decision, { send: true }>
  | { send: false; reason: "window" | "active" | "morning_receiver" | "done" };

export function decideWake(i: WakeInput): WakeDecision {
  const m = kstMinutes(i.now);
  // 깨우기는 아침 칸(§5-3 "깨우기는 아침 별 흐름을 받지 않는 동의자에게만") — 아침 창에 보낸다
  if (m < MORNING_OPEN_MIN || m >= MORNING_CLOSE_MIN) return { send: false, reason: "window" };
  if (!i.lastOpenAt) return { send: false, reason: "active" };
  if (i.receivesMorning) return { send: false, reason: "morning_receiver" };
  const idle = daysBetweenKst(i.lastOpenAt, i.now);
  // 가장 높은 단계 하나만 — 7일을 놓친 채 14일이 됐으면 14일 것만 보낸다
  const step = [...WAKE_STEPS].reverse().find((s) => idle >= s && idle < s + WAKE_GRACE_DAYS);
  if (step === undefined) return { send: false, reason: "active" };
  const ref = wakeRef(i.lastOpenAt, step);
  if (i.wakeRefsSent.includes(ref)) return { send: false, reason: "done" };
  const d = decidePush({ kind: "wake", prefOn: true, ...pick(i) });
  if (!d.send) return d;
  return { send: true, klass: "ad", step, ref };
}

function pick(i: Common): Omit<Common, never> {
  return {
    now: i.now,
    activeDevices: i.activeDevices,
    subscription: i.subscription,
    adConsent: i.adConsent,
    adSentToday: i.adSentToday,
    crisisWithin30d: i.crisisWithin30d,
  };
}
