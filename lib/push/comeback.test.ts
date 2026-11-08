// 설계 §7 단계 4 기준: 빈도 상한과 위기 신호 제외가 지켜진다. + 이어가기 '다음 날 저녁 1회', 깨우기 '7일 1회·14일 1회 더'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideResume, decideWake, wakeRef, type ResumeInput, type WakeInput } from "./comeback.ts";
import { resumeAdMessage, wakeAdMessage, AD_FOOTER } from "./ad-templates.ts";

/** KST 2026-11-{day} hh:mm */
function kst(day: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h - 9, m));
}
const iso = (day: number, hhmm: string) => kst(day, hhmm).toISOString();

const common = { activeDevices: 1, subscription: "none" as const, adConsent: true, adSentToday: [], crisisWithin30d: false };

const resume = (o: Partial<ResumeInput> = {}): ResumeInput => ({
  ...common, now: kst(10, "19:00"), reading: { ended: false, lastUserAt: iso(9, "23:50") }, ...o,
});

test("이어가기 — 어제 대화하다 나간 사람에게 다음 날 19:00~20:29", () => {
  assert.deepEqual(decideResume(resume()), { send: true, klass: "ad" });
  assert.deepEqual(decideResume(resume({ now: kst(10, "18:59") })), { send: false, reason: "window" });
  assert.deepEqual(decideResume(resume({ now: kst(10, "20:29") })), { send: true, klass: "ad" });
  assert.deepEqual(decideResume(resume({ now: kst(10, "20:30") })), { send: false, reason: "hours" });
});

test("이어가기 — 끝낸 대화·말 안 한 상담·오늘 다시 옴·그제 대화·상담 없음은 안 보낸다", () => {
  assert.deepEqual(decideResume(resume({ reading: { ended: true, lastUserAt: iso(9, "12:00") } })), { send: false, reason: "no_reading" });
  assert.deepEqual(decideResume(resume({ reading: { ended: false, lastUserAt: null } })), { send: false, reason: "no_reading" });
  assert.deepEqual(decideResume(resume({ reading: { ended: false, lastUserAt: iso(10, "09:00") } })), { send: false, reason: "not_yesterday" });
  assert.deepEqual(decideResume(resume({ reading: { ended: false, lastUserAt: iso(8, "23:59") } })), { send: false, reason: "not_yesterday" });
  assert.deepEqual(decideResume(resume({ reading: null })), { send: false, reason: "no_reading" });
  // KST 자정 경계 — 어제 00:00 은 어제
  assert.deepEqual(decideResume(resume({ reading: { ended: false, lastUserAt: iso(9, "00:00") } })), { send: true, klass: "ad" });
});

test("이어가기 — 동의 없음·위기 신호·저녁 칸 사용·하루 2 는 막는다", () => {
  assert.deepEqual(decideResume(resume({ adConsent: false })), { send: false, reason: "no_consent" });
  assert.deepEqual(decideResume(resume({ crisisWithin30d: true })), { send: false, reason: "crisis" });
  assert.deepEqual(decideResume(resume({ adSentToday: ["evening"] })), { send: false, reason: "frequency" });
  assert.deepEqual(decideResume(resume({ adSentToday: ["morning"] })), { send: true, klass: "ad" });
  assert.deepEqual(decideResume(resume({ activeDevices: 0 })), { send: false, reason: "no_device" });
});

const wake = (o: Partial<WakeInput> = {}): WakeInput => ({
  ...common, now: kst(17, "08:30"), lastOpenAt: iso(10, "21:00"), receivesMorning: false, wakeRefsSent: [], ...o,
});

test("깨우기 — 7일 미접속 1회, 14일 1회 더", () => {
  assert.deepEqual(decideWake(wake()), { send: true, klass: "ad", step: 7, ref: "2026-11-10:7" });
  assert.deepEqual(decideWake(wake({ now: kst(16, "08:30") })), { send: false, reason: "active" }); // 6일
  assert.deepEqual(decideWake(wake({ wakeRefsSent: ["2026-11-10:7"] })), { send: false, reason: "done" });
  assert.deepEqual(decideWake(wake({ now: kst(18, "08:30"), wakeRefsSent: ["2026-11-10:7"] })), { send: false, reason: "done" });
  assert.deepEqual(decideWake(wake({ now: kst(24, "08:30"), wakeRefsSent: ["2026-11-10:7"] })), { send: true, klass: "ad", step: 14, ref: "2026-11-10:14" });
  assert.deepEqual(decideWake(wake({ now: kst(25, "08:30"), wakeRefsSent: ["2026-11-10:7", "2026-11-10:14"] })), { send: false, reason: "done" });
  // 21일 넘으면 더 안 보낸다
  assert.deepEqual(decideWake(wake({ now: kst(31, "08:30"), wakeRefsSent: ["2026-11-10:7"] })), { send: false, reason: "active" });
  // 7일을 놓친 채 14일이 되면 14일 것 하나만
  assert.deepEqual(decideWake(wake({ now: kst(24, "08:30") })), { send: true, klass: "ad", step: 14, ref: "2026-11-10:14" });
});

test("깨우기 — 다시 앱을 열면 새 미접속으로 다시 센다", () => {
  assert.equal(wakeRef(iso(20, "10:00"), 7), "2026-11-20:7");
  assert.deepEqual(
    decideWake(wake({ now: kst(27, "08:30"), lastOpenAt: iso(20, "10:00"), wakeRefsSent: ["2026-11-10:7", "2026-11-10:14"] })),
    { send: true, klass: "ad", step: 7, ref: "2026-11-20:7" },
  );
});

test("깨우기 — 아침 흐름을 받는 사람·창 밖·동의 없음·위기·아침 칸 사용은 안 보낸다", () => {
  assert.deepEqual(decideWake(wake({ receivesMorning: true })), { send: false, reason: "morning_receiver" });
  assert.deepEqual(decideWake(wake({ now: kst(17, "08:29") })), { send: false, reason: "window" });
  assert.deepEqual(decideWake(wake({ now: kst(17, "11:00") })), { send: false, reason: "window" });
  assert.deepEqual(decideWake(wake({ adConsent: false })), { send: false, reason: "no_consent" });
  assert.deepEqual(decideWake(wake({ crisisWithin30d: true })), { send: false, reason: "crisis" });
  assert.deepEqual(decideWake(wake({ adSentToday: ["morning"] })), { send: false, reason: "frequency" });
  assert.deepEqual(decideWake(wake({ adSentToday: ["evening", "morning"] })), { send: false, reason: "frequency" });
  assert.deepEqual(decideWake(wake({ lastOpenAt: null })), { send: false, reason: "active" });
});

test("문구 — 광고 틀, 고민 내용 자리 없음", () => {
  for (const m of [resumeAdMessage(), wakeAdMessage(7), wakeAdMessage(14)]) {
    assert.ok(m.title.startsWith("(광고) ") && m.body.startsWith("(광고) ") && m.body.endsWith(AD_FOOTER));
  }
});
