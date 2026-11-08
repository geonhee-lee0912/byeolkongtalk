// 설계 §8 — §5-1 판정 함수 전수 검사(분류·동의·시간대 경계·빈도·위기 신호·로그아웃 기기).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, decidePush, kstMinutes, type DecideInput, type PushKind, type Subscription } from "./decide.ts";

/** KST 2026-11-10 hh:mm → Date */
function kst(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, 10, h - 9, m));
}

const base: DecideInput = {
  kind: "resume",
  now: kst("19:00"),
  activeDevices: 1,
  prefOn: true,
  subscription: "none",
  adConsent: true,
  adSentToday: [],
  crisisWithin30d: false,
};

test("kstMinutes — UTC 를 KST 분으로", () => {
  assert.equal(kstMinutes(kst("00:00")), 0);
  assert.equal(kstMinutes(kst("08:30")), 510);
  assert.equal(kstMinutes(new Date("2026-11-10T14:59:00Z")), 23 * 60 + 59);
});

test("분류 — 구독/체험/비구독 × A/B/C", () => {
  const rows: [PushKind, Subscription, "info" | "ad"][] = [
    ["revisit", "paid", "info"], ["revisit", "trial", "info"], ["revisit", "none", "info"],
    ["reconfirm", "paid", "info"], ["reconfirm", "none", "info"],
    ["morning", "paid", "info"], ["morning", "trial", "ad"], ["morning", "none", "ad"],
    ["resume", "paid", "ad"], ["resume", "trial", "ad"], ["resume", "none", "ad"],
    ["wake", "paid", "ad"], ["wake", "trial", "ad"], ["wake", "none", "ad"],
  ];
  for (const [kind, sub, want] of rows) assert.equal(classify(kind, sub), want, `${kind}/${sub}`);
});

test("B — 같은 시각에 구독자는 정보성, 동의한 비구독·체험자는 광고, 비동의 비구독자는 안 받는다", () => {
  const at = { ...base, kind: "morning" as const, now: kst("08:30") };
  assert.deepEqual(decidePush({ ...at, subscription: "paid", adConsent: false }), { send: true, klass: "info" });
  assert.deepEqual(decidePush({ ...at, subscription: "none", adConsent: true }), { send: true, klass: "ad" });
  assert.deepEqual(decidePush({ ...at, subscription: "trial", adConsent: true }), { send: true, klass: "ad" });
  assert.deepEqual(decidePush({ ...at, subscription: "none", adConsent: false }), { send: false, reason: "no_consent" });
  assert.deepEqual(decidePush({ ...at, subscription: "trial", adConsent: false }), { send: false, reason: "no_consent" });
});

test("광고 시간대 경계 — 07:59 X · 08:00 O · 20:29 O · 20:30 X · 21:00 X", () => {
  const rows: [string, boolean][] = [["07:59", false], ["08:00", true], ["20:29", true], ["20:30", false], ["21:00", false], ["23:30", false], ["03:00", false]];
  for (const [t, ok] of rows) {
    const d = decidePush({ ...base, now: kst(t) });
    assert.deepEqual(d, ok ? { send: true, klass: "ad" } : { send: false, reason: "hours" }, t);
  }
});

test("정보성 시간대 경계 — 07:59 X · 08:00 O · 20:30 O · 20:59 O · 21:00 X", () => {
  const rows: [string, boolean][] = [["07:59", false], ["08:00", true], ["20:29", true], ["20:30", true], ["20:59", true], ["21:00", false]];
  for (const [t, ok] of rows) {
    const d = decidePush({ ...base, kind: "revisit", adConsent: false, now: kst(t) });
    assert.deepEqual(d, ok ? { send: true, klass: "info" } : { send: false, reason: "hours" }, t);
  }
});

test("로그아웃 기기(활성 기기 0) — 정보성·광고 모두 안 보낸다", () => {
  for (const kind of ["revisit", "reconfirm", "morning", "resume", "wake"] as const) {
    assert.deepEqual(decidePush({ ...base, kind, now: kst("10:00"), activeDevices: 0 }), { send: false, reason: "no_device" }, kind);
  }
});

test("설정 칸이 꺼져 있으면 안 보낸다(동의보다 먼저 본다)", () => {
  assert.deepEqual(decidePush({ ...base, prefOn: false }), { send: false, reason: "pref_off" });
  assert.deepEqual(decidePush({ ...base, kind: "morning", subscription: "paid", prefOn: false, now: kst("08:30") }), { send: false, reason: "pref_off" });
});

test("동의 없는 광고 — 시각이 맞아도 안 간다", () => {
  assert.deepEqual(decidePush({ ...base, adConsent: false }), { send: false, reason: "no_consent" });
});

test("빈도 — 광고 하루 2, 칸마다 1. 정보성은 상한과 별개", () => {
  assert.deepEqual(decidePush({ ...base, kind: "resume", adSentToday: ["morning"] }), { send: true, klass: "ad" });
  assert.deepEqual(decidePush({ ...base, kind: "resume", adSentToday: ["evening"] }), { send: false, reason: "frequency" });
  assert.deepEqual(decidePush({ ...base, kind: "resume", adSentToday: ["morning", "evening"] }), { send: false, reason: "frequency" });
  assert.deepEqual(decidePush({ ...base, kind: "wake", now: kst("08:30"), adSentToday: ["morning"] }), { send: false, reason: "frequency" });
  assert.deepEqual(decidePush({ ...base, kind: "morning", now: kst("08:30"), adSentToday: ["morning"] }), { send: false, reason: "frequency" });
  // 구독자 아침 흐름은 정보성 — 광고 기록과 상관없다
  assert.deepEqual(decidePush({ ...base, kind: "morning", subscription: "paid", now: kst("08:30"), adSentToday: ["morning", "evening"] }), { send: true, klass: "info" });
  assert.deepEqual(decidePush({ ...base, kind: "revisit", adSentToday: ["morning", "evening"] }), { send: true, klass: "info" });
});

test("위기 신호 30일 — 광고만 막고 정보성은 보낸다", () => {
  assert.deepEqual(decidePush({ ...base, crisisWithin30d: true }), { send: false, reason: "crisis" });
  assert.deepEqual(decidePush({ ...base, kind: "morning", now: kst("08:30"), crisisWithin30d: true }), { send: false, reason: "crisis" });
  assert.deepEqual(decidePush({ ...base, kind: "morning", subscription: "paid", now: kst("08:30"), crisisWithin30d: true }), { send: true, klass: "info" });
  assert.deepEqual(decidePush({ ...base, kind: "revisit", crisisWithin30d: true }), { send: true, klass: "info" });
});
