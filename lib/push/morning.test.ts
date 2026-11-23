// 설계 §7 단계 3 기준: 같은 시각에 구독자와 비구독 동의자가 다른 틀을 받는다. 비동의 비구독자는 받지 않는다. 14일 미열람 멈춤.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMorning, type MorningInput } from "./morning.ts";
import { morningInfoMessage, promoWordsIn } from "./templates.ts";
import { morningAdMessage, AD_FOOTER } from "./ad-templates.ts";
import { todayFlow } from "./today-flow.ts";
import { DAY_LINE, DAY_NAME } from "@/lib/byeolmaru/day-label";

function kst(hhmm: string, day = 10): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h - 9, m));
}

const base: MorningInput = {
  now: kst("08:30"),
  activeDevices: 1,
  morningPref: true,
  subscription: "none",
  adConsent: true,
  adSentToday: [],
  crisisWithin30d: false,
  lastOpenAt: "2026-11-09T00:00:00Z",
  sentToday: false,
  hasFlow: true,
};

test("같은 08:30 — 구독자 정보성, 비구독·체험 동의자 광고, 비동의 비구독자 안 받음, 비동의 구독자는 받음", () => {
  assert.deepEqual(decideMorning({ ...base, subscription: "paid", adConsent: false }), { send: true, klass: "info" });
  assert.deepEqual(decideMorning({ ...base, subscription: "none" }), { send: true, klass: "ad" });
  assert.deepEqual(decideMorning({ ...base, subscription: "trial" }), { send: true, klass: "ad" });
  assert.deepEqual(decideMorning({ ...base, adConsent: false }), { send: false, reason: "no_consent" });
});

test("아침 창 — 08:29 X · 08:30 O · 10:59 O · 11:00 X", () => {
  assert.deepEqual(decideMorning({ ...base, now: kst("08:29") }), { send: false, reason: "window" });
  assert.equal(decideMorning({ ...base, now: kst("08:30") }).send, true);
  assert.equal(decideMorning({ ...base, now: kst("10:59") }).send, true);
  assert.deepEqual(decideMorning({ ...base, now: kst("11:00") }), { send: false, reason: "window" });
});

test("오늘 이미 보냄·아침 칸 꺼짐·기기 없음·위기 신호(광고만)", () => {
  assert.deepEqual(decideMorning({ ...base, sentToday: true }), { send: false, reason: "already" });
  assert.deepEqual(decideMorning({ ...base, morningPref: false, subscription: "paid" }), { send: false, reason: "pref_off" });
  assert.deepEqual(decideMorning({ ...base, activeDevices: 0 }), { send: false, reason: "no_device" });
  assert.deepEqual(decideMorning({ ...base, crisisWithin30d: true }), { send: false, reason: "crisis" });
  assert.deepEqual(decideMorning({ ...base, subscription: "paid", crisisWithin30d: true }), { send: true, klass: "info" });
  // 아침 칸에 이미 광고(깨우기)가 나갔으면 비구독 아침 광고는 안 간다
  assert.deepEqual(decideMorning({ ...base, adSentToday: ["morning"] }), { send: false, reason: "frequency" });
});

test("14일 미열람이면 멈추고, 다시 열면 재개", () => {
  const now = kst("08:30");
  const ago = (d: number, extraMs = 0) => new Date(now.getTime() - d * 86_400_000 - extraMs).toISOString();
  assert.equal(decideMorning({ ...base, lastOpenAt: ago(14) }).send, true);
  assert.deepEqual(decideMorning({ ...base, lastOpenAt: ago(14, 60_000) }), { send: false, reason: "idle" });
  assert.deepEqual(decideMorning({ ...base, subscription: "paid", lastOpenAt: ago(30) }), { send: false, reason: "idle" });
  assert.equal(decideMorning({ ...base, lastOpenAt: ago(0) }).send, true);
  assert.equal(decideMorning({ ...base, lastOpenAt: null }).send, true);
});

test("생일이 없으면 보내지 않는다", () => {
  assert.deepEqual(decideMorning({ ...base, hasFlow: false }), { send: false, reason: "no_profile" });
});

test("틀 — 구독자 정보성엔 판촉·(광고) 없음, 비구독 광고는 (광고)·수신거부. 열 가지 하루 전부", () => {
  for (const tg of Object.keys(DAY_NAME) as (keyof typeof DAY_NAME)[]) {
    const flow = { name: DAY_NAME[tg], line: DAY_LINE[tg] };
    const info = morningInfoMessage(flow);
    assert.deepEqual(promoWordsIn(info.title + " " + info.body), [], tg);
    assert.ok(!info.title.includes("(광고)") && !info.body.includes("(광고)"));
    const ad = morningAdMessage(flow);
    assert.ok(ad.title.startsWith("(광고) ") && ad.body.startsWith("(광고) ") && ad.body.endsWith(AD_FOOTER), tg);
    assert.notEqual(info.body, ad.body);
  }
});

test("오늘의 흐름 계산 — 생일 있으면 하루 이름·풀이, 없으면 null", () => {
  const row = { birth_date: "1995-03-14", birth_time: null, is_lunar_input: false, is_leap_month: false, gender: "female" };
  const f = todayFlow(row, "2026-11-10");
  assert.ok(f && Object.values(DAY_NAME).includes(f.name) && Object.values(DAY_LINE).includes(f.line));
  assert.deepEqual(todayFlow(row, "2026-11-10"), f); // 같은 날 같은 값
  assert.equal(todayFlow({ ...row, birth_date: null }, "2026-11-10"), null);
  assert.equal(todayFlow(null, "2026-11-10"), null);
});
