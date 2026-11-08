// 아침 알림(오늘의 별 흐름) 판정 — 순수 함수(테스트 morning.test.ts). 설계 §3 B·C, §5-2, §5-3.
// 공통 판정(decide.ts)에 아침 알림만의 규칙을 얹는다: 아침 창, 오늘 이미 보냄, 14일 미접속 멈춤, 생일 없음.
import { decidePush, kstMinutes, type Decision, type Slot, type Subscription } from "./decide.ts";

/** 아침 발송 창 — 08:30 부터(§5-2). 끝은 11:00 — 🔴 설계에 없는 값(아침의 끝). 운영자 확인 대상(HANDOFF '결정 필요') */
export const MORNING_OPEN_MIN = 8 * 60 + 30;
export const MORNING_CLOSE_MIN = 11 * 60;
/** 아침 알림을 받는데 이만큼 앱을 열지 않으면 멈춘다. 다시 열면 재개(§5-3, 운영자 결정 11-06 "이대로 시작") */
export const MORNING_IDLE_STOP_DAYS = 14;

const DAY_MS = 86_400_000;

export function inMorningWindow(now: Date): boolean {
  const m = kstMinutes(now);
  return m >= MORNING_OPEN_MIN && m < MORNING_CLOSE_MIN;
}

export type MorningInput = {
  now: Date;
  activeDevices: number;
  morningPref: boolean;
  subscription: Subscription;
  adConsent: boolean;
  adSentToday: Slot[];
  crisisWithin30d: boolean;
  /** 앱을 마지막으로 연 시각(없으면 null — 멈추지 않는다) */
  lastOpenAt: string | null;
  /** 오늘 아침 알림이 이미 나갔다 */
  sentToday: boolean;
  /** 생일이 있어 오늘의 흐름을 계산할 수 있다 */
  hasFlow: boolean;
};

export type MorningDecision = Decision | { send: false; reason: "window" | "already" | "idle" | "no_profile" };

export function decideMorning(i: MorningInput): MorningDecision {
  if (i.sentToday) return { send: false, reason: "already" };
  if (!inMorningWindow(i.now)) return { send: false, reason: "window" };
  const d = decidePush({
    kind: "morning",
    now: i.now,
    activeDevices: i.activeDevices,
    prefOn: i.morningPref,
    subscription: i.subscription,
    adConsent: i.adConsent,
    adSentToday: i.adSentToday,
    crisisWithin30d: i.crisisWithin30d,
  });
  if (!d.send) return d;
  if (i.lastOpenAt && i.now.getTime() - new Date(i.lastOpenAt).getTime() > MORNING_IDLE_STOP_DAYS * DAY_MS) {
    return { send: false, reason: "idle" };
  }
  if (!i.hasFlow) return { send: false, reason: "no_profile" };
  return d;
}
