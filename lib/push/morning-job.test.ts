import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchRevisits, type DispatchStore } from "./dispatch.ts";
import type { ExpoMessage } from "./expo.ts";
import type { FactsStore, PushFacts } from "./facts.ts";
import { morningJob } from "./morning-job.ts";

const SECRET = "m".repeat(40);
const profile = { birth_date: "1995-03-14", birth_time: null, is_lunar_input: false, is_leap_month: false, gender: "female" };
const fact = (o: Partial<PushFacts> = {}): PushFacts => ({
  morningPref: true, adConsent: false, subscription: "none", crisisWithin30d: false,
  lastOpenAt: "2026-11-09T00:00:00Z", sendsToday: [], profile, ...o,
});

function harness(users: Record<string, PushFacts>) {
  const sent: ExpoMessage[][] = [];
  const claimed = new Set<string>();
  let nextId = 1;
  const store: DispatchStore = {
    dueRevisits: async () => [],
    activeDeviceTokens: async () => [],
    getRevisitPref: async () => true,
    claimSend: async (r) => { const k = `${r.userId}|${r.kind}|${r.refId}|${r.sendDate}`; if (claimed.has(k)) return null; claimed.add(k); return nextId++; },
    deliveredSend: async () => true,
    releaseSend: async () => {},
    saveTickets: async () => {},
    markSchedule: async () => {},
    disableTokens: async () => {},
    uncheckedReceipts: async () => [],
    markReceiptsChecked: async () => {},
  };
  const fs: FactsStore = {
    activeDevices: async () => new Map(Object.keys(users).map((u) => [u, { tokens: [`tok-${u}`], lastSeenAt: null }])),
    facts: async (ids) => new Map(ids.map((u) => [u, users[u]])),
  };
  const expo = { send: async (m: ExpoMessage[]) => { sent.push(m); return m.map((_, i) => ({ status: "ok" as const, id: `t${i}` })); }, receipts: async () => ({}) };
  const run = (now: Date) => dispatchRevisits(now, store, expo, () => {}, { warn: () => {}, jobs: [morningJob(fs)], unsubSecret: SECRET });
  return { run, sent };
}

const AT_0830 = new Date("2026-11-09T23:30:00Z"); // KST 11-10 08:30

test("같은 시각 — 구독자 정보성, 동의 비구독자 광고(표 포함), 비동의 비구독자 없음. 두 번 돌아도 한 번", async () => {
  const h = harness({
    paid: fact({ subscription: "paid" }),
    adNone: fact({ adConsent: true }),
    noAd: fact(),
  });
  await h.run(AT_0830);
  await h.run(new Date(AT_0830.getTime() + 15 * 60_000));
  const by = new Map(h.sent.map((m) => [m[0].to, m[0]]));
  assert.equal(h.sent.length, 2);
  const info = by.get("tok-paid")!;
  assert.equal(info.channelId, "info");
  assert.ok(!info.title.startsWith("(광고)"));
  assert.equal(info.data.unsub, undefined);
  assert.ok(info.data.path.startsWith("/byeolmaru/day#bkp="));
  const ad = by.get("tok-adNone")!;
  assert.equal(ad.channelId, "ad");
  assert.ok(ad.title.startsWith("(광고) ") && ad.body.startsWith("(광고) "));
  assert.ok(ad.data.unsub && ad.data.path.includes("&bku="));
  assert.equal(by.has("tok-noAd"), false);
});

test("아침 창 밖(08:00·11:30)이면 아무것도 안 한다", async () => {
  const h = harness({ paid: fact({ subscription: "paid" }) });
  await h.run(new Date("2026-11-09T23:00:00Z"));
  await h.run(new Date("2026-11-10T02:30:00Z"));
  assert.equal(h.sent.length, 0);
});

test("14일 미열람·생일 없음·위기 신호(광고)는 건너뛴다", async () => {
  const h = harness({
    idle: fact({ subscription: "paid", lastOpenAt: "2026-10-20T00:00:00Z" }),
    noBirth: fact({ subscription: "paid", profile: { ...profile, birth_date: null } }),
    crisis: fact({ adConsent: true, crisisWithin30d: true }),
  });
  await h.run(AT_0830);
  assert.equal(h.sent.length, 0);
});
