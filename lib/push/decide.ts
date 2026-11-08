// 알림을 보낼지 정하는 순수 함수 — 설계 2026-11-06-앱-알림 §5-1 의 순서 그대로. DB·시계·네트워크 없음(테스트 decide.test.ts).
// cron 이 알림 한 건마다 부른다. 여기서 'ad' 로 정해진 알림은 반드시 광고 틀(ad-templates.ts)로, 'info' 는 정보성 틀(templates.ts)로 만든다.

/** 알림 종류. 2차(생일·이번 달·챙길 날·체험·만료·신년)는 아직 없다 */
export type PushKind = "revisit" | "reconfirm" | "morning" | "resume" | "wake";

/** 설계 §3 의 묶음 — A 정보성(모든 회원) / B 구독자 정보성(구독 중이 아니면 광고) / C 광고 */
export type PushGroup = "A" | "B" | "C";

export const KIND_GROUP: Record<PushKind, PushGroup> = {
  revisit: "A",
  reconfirm: "A", // 2년 재확인 통지 — 동의 여부 확인 안내는 광고가 아니다(Q&A 08-06)
  morning: "B",
  resume: "C",
  wake: "C",
};

/** 광고 하루 2칸(§5-3) — 종류마다 어느 칸을 쓰는지. 정보성은 칸을 쓰지 않는다 */
export type Slot = "morning" | "evening";
export const KIND_SLOT: Record<PushKind, Slot | null> = {
  revisit: null,
  reconfirm: null,
  morning: "morning",
  resume: "evening",
  wake: "morning", // 깨우기는 아침 별 흐름을 안 받는 사람에게만 가니 아침 칸이 비어 있다(§5-3)
};

/** 유료 구독 중 / 체험 중(돈을 안 냈으니 비구독으로 본다, §3 C) / 없음 */
export type Subscription = "paid" | "trial" | "none";

export type DecideInput = {
  kind: PushKind;
  /** 보내는 시각. 도착은 거의 같다고 보고, 지연은 광고 창을 20:30 에 닫아 감안한다(§5-2) */
  now: Date;
  /** 로그인된(해제·비활성 안 된) 기기 수 — 로그아웃하면 토큰이 지워져 0 이 된다(§6-1) */
  activeDevices: number;
  /** 이 종류의 알림 설정 칸(§4-6). 재확인 통지처럼 끄는 칸이 없는 종류는 true 로 넘긴다 */
  prefOn: boolean;
  subscription: Subscription;
  /** 광고성 정보 수신 동의(앱 푸시)가 지금 켜져 있는가 */
  adConsent: boolean;
  /** 오늘(KST) 이 회원에게 이미 나간 광고의 칸 */
  adSentToday: Slot[];
  /** 최근 30일 안에 위기 신호가 있었는가 */
  crisisWithin30d: boolean;
};

export type SkipReason = "no_device" | "pref_off" | "no_consent" | "hours" | "frequency" | "crisis";
export type Decision = { send: true; klass: "info" | "ad" } | { send: false; reason: SkipReason };

/** 하루 광고 상한(§5-3) */
export const AD_DAILY_MAX = 2;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 광고: 08:00 이상 20:30 미만 발송 → 21:00 전 도착(§5-2) */
export const AD_OPEN_MIN = 8 * 60;
export const AD_CLOSE_MIN = 20 * 60 + 30;
/** 정보성: 08:00 이상 21:00 미만 — 판정을 잘못했을 때 야간 위반까지 겹치지 않게(§5-2) */
export const INFO_OPEN_MIN = 8 * 60;
export const INFO_CLOSE_MIN = 21 * 60;

/** KST 하루 안의 분(0~1439) */
export function kstMinutes(now: Date): number {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
}

/** 분류(§5-1 ③) — A 는 늘 정보성, B 는 유료 구독 중일 때만 정보성(체험·비구독은 광고), C 는 늘 광고 */
export function classify(kind: PushKind, subscription: Subscription): "info" | "ad" {
  const g = KIND_GROUP[kind];
  if (g === "A") return "info";
  if (g === "B") return subscription === "paid" ? "info" : "ad";
  return "ad";
}

export function decidePush(i: DecideInput): Decision {
  // ① 로그인된 기기
  if (i.activeDevices <= 0) return { send: false, reason: "no_device" };
  // ② 이 종류의 칸
  if (!i.prefOn) return { send: false, reason: "pref_off" };
  // ③ 분류
  const klass = classify(i.kind, i.subscription);
  const min = kstMinutes(i.now);
  if (klass === "info") {
    if (min < INFO_OPEN_MIN || min >= INFO_CLOSE_MIN) return { send: false, reason: "hours" };
    return { send: true, klass };
  }
  // ④ 광고 — 동의, 도착 창
  if (!i.adConsent) return { send: false, reason: "no_consent" };
  if (min < AD_OPEN_MIN || min >= AD_CLOSE_MIN) return { send: false, reason: "hours" };
  // ⑤ 빈도 — 하루 2, 칸마다 1
  const slot = KIND_SLOT[i.kind];
  if (i.adSentToday.length >= AD_DAILY_MAX || (slot !== null && i.adSentToday.includes(slot))) {
    return { send: false, reason: "frequency" };
  }
  // ⑥ 위기 신호
  if (i.crisisWithin30d) return { send: false, reason: "crisis" };
  return { send: true, klass };
}
