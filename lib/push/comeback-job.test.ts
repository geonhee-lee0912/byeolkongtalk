import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchRevisits, type DispatchStore } from "./dispatch.ts";
import type { ExpoMessage } from "./expo.ts";
import type { FactsStore, PushFacts } from "./facts.ts";
import { comebackJob, type ResumeStore } from "./comeback-job.ts";
import { morningJob } from "./morning-job.ts";

const SECRET = "c".repeat(40);
const fact = (o: Partial<PushFacts> = {}): PushFacts => ({
  morningPref: true, adConsent: true, subscription: "none", crisisWithin30d: false,
  lastOpenAt: "2026-11-01T12:00:00Z", sendsToday: [], profile: null, wakeRefsSent: [], ...o,
});

function harness(users: Record<string, PushFacts>, readings: Record<string, { readingId: string; ended: boolean; lastUserAt: string | null }> = {}) {
  const sent: ExpoMessage[][] = [];
  const sends: { userId: string; kind: string; klass: "info" | "ad" }[] = [];
  let nextId = 1;
  const store: DispatchStore = {
    dueRevisits: async () => [],
    activeDeviceTokens: async () => [],
    getRevisitPref: async () => true,
    claimSend: async (r) => {
      if (sends.some((s) => s.userId === r.userId && s.kind === r.kind)) return null;
      sends.push({ userId: r.userId, kind: r.kind, klass: r.klass });
      return nextId++;
    },
    deliveredSend: async () => true,
    releaseSend: async () => {},
    saveTickets: async () => {},
    markSchedule: async () => {},
    disableTokens: async () => {},
    uncheckedReceipts: async () => [],
    markReceiptsChecked: async () => {},
  };
  // 판정 재료는 부를 때마다 '오늘 보낸 알림'을 새로 읽는다(실제 저장소처럼)
  const fs: FactsStore = {
    activeDevices: async () => new Map(Object.keys(users).map((u) => [u, { tokens: [`tok-${u}`], lastSeenAt: null }])),
    facts: async (ids) => new Map(ids.map((u) => [u, { ...users[u], sendsToday: sends.filter((s) => s.userId === u).map((s) => ({ kind: s.kind, klass: s.klass })) }])),
  };
  let resumeLookups = 0;
  const rs: ResumeStore = { latestTarot: async (u) => { resumeLookups++; return readings[u] ?? null; } };
  const expo = { send: async (m: ExpoMessage[]) => { sent.push(m); return m.map((_, i) => ({ status: "ok" as const, id: `t${i}` })); }, receipts: async () => ({}) };
  const run = (now: Date) => dispatchRevisits(now, store, expo, () => {}, { warn: () => {}, jobs: [morningJob(fs), comebackJob(fs, rs)], unsubSecret: SECRET });
  return { run, sent, get resumeLookups() { return resumeLookups; } };
}

const birth = { birth_date: "1995-03-14", birth_time: null, is_lunar_input: false, is_leap_month: false, gender: "female" };

test("아침 — 7일 미접속 동의자는 깨우기, 아침 흐름 받는 사람(같은 실행에서 아침 칸 사용)은 깨우기 없음", async () => {
  const h = harness({
    quiet: fact(), // 11-01 에 마지막으로 열고 7일 넘음(11-09 08:30)
    morningAd: fact({ profile: birth, lastOpenAt: "2026-11-08T00:00:00Z" }),
    noConsent: fact({ adConsent: false }),
  });
  await h.run(new Date("2026-11-08T23:30:00Z")); // KST 11-09 08:30
  const to = h.sent.map((m) => m[0].to).sort();
  assert.deepEqual(to, ["tok-morningAd", "tok-quiet"]);
  const w = h.sent.find((m) => m[0].to === "tok-quiet")![0];
  assert.equal(w.data.kind, "wake");
  assert.ok(w.data.path.startsWith("/#bkp=") && w.data.path.includes("&bku="));
  assert.equal(h.sent.find((m) => m[0].to === "tok-morningAd")![0].data.kind, "morning");
});

test("저녁 — 어제 나간 대화는 이어가기 한 번, 동의 없음·위기 신호는 상담 조회조차 안 한다", async () => {
  const h = harness(
    { left: fact({ lastOpenAt: "2026-11-09T10:00:00Z" }), crisis: fact({ crisisWithin30d: true }), noConsent: fact({ adConsent: false }) },
    { left: { readingId: "r1", ended: false, lastUserAt: "2026-11-09T12:00:00Z" } },
  );
  await h.run(new Date("2026-11-10T10:00:00Z")); // KST 11-10 19:00
  await h.run(new Date("2026-11-10T10:15:00Z"));
  assert.deepEqual(h.sent.map((m) => [m[0].to, m[0].data.kind]), [["tok-left", "resume"]]);
  assert.equal(h.resumeLookups, 1); // crisis·noConsent 는 조회 0, left 는 두 번째 실행에서 저녁 칸이 차 조회 안 함
});

test("낮(12:00)엔 아무것도 안 한다", async () => {
  const h = harness({ quiet: fact() }, { quiet: { readingId: "r", ended: false, lastUserAt: "2026-11-09T12:00:00Z" } });
  await h.run(new Date("2026-11-10T03:00:00Z"));
  assert.equal(h.sent.length, 0);
});
