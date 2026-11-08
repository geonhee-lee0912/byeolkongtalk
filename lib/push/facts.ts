// 회원별 발송 판정 재료 — 아침 알림(단계 3)·이어가기·깨우기(단계 4) cron 이 같이 쓴다.
// 저장소 구현은 store.ts(supabaseFactsStore). 이 파일은 타입과 작은 순수 도우미만 둔다.
import type { PushKind, Slot, Subscription } from "./decide.ts";
import { KIND_SLOT } from "./decide.ts";
import type { ProfileRow } from "./today-flow.ts";

export type DeviceGroup = { tokens: string[]; lastSeenAt: string | null };

export type PushFacts = {
  morningPref: boolean;
  adConsent: boolean;
  subscription: Subscription;
  crisisWithin30d: boolean;
  /** 앱을 마지막으로 연 시각 — push_app_opens 와 기기 최근 확인 중 늦은 것 */
  lastOpenAt: string | null;
  /** 오늘(KST) 이 회원에게 나간 알림 */
  sendsToday: { kind: string; klass: "info" | "ad" }[];
  profile: ProfileRow | null;
};

export interface FactsStore {
  /** 로그인된(해제·비활성 아닌) 기기를 회원별로 */
  activeDevices(): Promise<Map<string, DeviceGroup>>;
  /** 회원 100명 이하씩 */
  facts(userIds: string[], now: Date, todayKst: string): Promise<Map<string, PushFacts>>;
}

export const FACTS_CHUNK = 100;

/** 오늘 나간 광고가 쓴 칸. 칸을 모르는 광고 종류(앞으로 더할 2차 종류 등)는 저녁 칸으로 친다 — 하루 2 상한엔 어쨌든 들어간다 */
export function adSlotsToday(f: PushFacts): Slot[] {
  return f.sendsToday
    .filter((s) => s.klass === "ad")
    .map((s) => KIND_SLOT[s.kind as PushKind] ?? "evening")
    .filter((x): x is Slot => x !== null);
}

/** 두 시각 중 늦은 것(없으면 null) */
export function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}
