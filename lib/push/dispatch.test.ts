import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchRevisits, type DispatchStore, type DueRevisit, type ExpoApi } from "./dispatch.ts";
import type { ExpoMessage, ExpoTicket } from "./expo.ts";

// KST 2026-11-10 10:00 = 01:00Z (창 안)
const OPEN = new Date("2026-11-10T01:00:00Z");
const EARLY = new Date("2026-11-09T23:00:00Z"); // KST 08:00
const LATE = new Date("2026-11-10T12:30:00Z"); // KST 21:30

function setup(o: {
  due?: DueRevisit[];
  devices?: Record<string, string[]>;
  pref?: Record<string, boolean>;
  tickets?: (m: ExpoMessage[]) => ExpoTicket[];
  sendThrows?: boolean;
  receipts?: Record<string, { status: "ok" | "error"; details?: { error?: string } }>;
  unchecked?: { sendId: number; tickets: { id: string; token: string }[] }[];
} = {}) {
  const due: DueRevisit[] = o.due ?? [{ id: "s1", userId: "u1", readingId: "r1", consultationType: "tarot", sendOn: "2026-11-10" }];
  const devices = o.devices ?? { u1: ["tokA"] };
  const claimed = new Set<string>();
  const sent: ExpoMessage[][] = [];
  const marks: [string, string][] = [];
  const disabled: string[][] = [];
  const saved: { sendId: number; tickets: unknown[] }[] = [];
  const checked: number[][] = [];
  const logs: { err: unknown; extra?: Record<string, unknown> }[] = [];
  const log = (err: unknown, ctx?: { extra?: Record<string, unknown> }) => { logs.push({ err, extra: ctx?.extra }); };
  const warns: { message: string; extra?: Record<string, unknown> }[] = [];
  const warn = (message: string, ctx?: { extra?: Record<string, unknown> }) => { warns.push({ message, extra: ctx?.extra }); };
  let released = 0;
  let nextId = 1;
  const store: DispatchStore = {
    dueRevisits: async () => due.filter((d) => !marks.some(([id, s]) => id === d.id && s !== "pending")),
    activeDeviceTokens: async (u) => devices[u] ?? [],
    getRevisitPref: async (u) => o.pref?.[u] ?? true,
    claimSend: async (r) => {
      const k = `${r.userId}|${r.refId}|${r.sendDate}`;
      if (claimed.has(k)) return null;
      claimed.add(k);
      return nextId++;
    },
    releaseSend: async () => { released++; claimed.clear(); },
    saveTickets: async (sendId, tickets) => { saved.push({ sendId, tickets }); },
    markSchedule: async (id, status) => { marks.push([id, status]); },
    disableTokens: async (t) => { disabled.push(t); },
    uncheckedReceipts: async () => o.unchecked ?? [],
    markReceiptsChecked: async (ids) => { checked.push(ids); },
  };
  const expo: ExpoApi = {
    send: async (m) => {
      sent.push(m);
      if (o.sendThrows) throw new Error("expo down");
      return o.tickets ? o.tickets(m) : m.map((_, i) => ({ status: "ok" as const, id: `tk${sent.length}-${i}` }));
    },
    receipts: async () => o.receipts ?? {},
  };
  return { store, expo, log, logs, warn, warns, sent, marks, disabled, saved, checked, get released() { return released; } };
}

test("cron 이 두 번 돌아도 한 번만 보낸다", async () => {
  const s = setup();
  // 두 번째 실행에서도 같은 예약이 pending 으로 보이도록(markSchedule 실패 상황) store 를 감싼다.
  const again: DispatchStore = { ...s.store, dueRevisits: async () => [{ id: "s1", userId: "u1", readingId: "r1", consultationType: "tarot", sendOn: "2026-11-10" }] };
  await dispatchRevisits(OPEN, again, s.expo, s.log);
  await dispatchRevisits(OPEN, again, s.expo, s.log);
  assert.equal(s.sent.length, 1);
});

test("예약 회원의 기기에만 보낸다", async () => {
  const s = setup({ devices: { u2: ["tokOther"] } }); // u1 예약, u2 기기만 있음
  const r = await dispatchRevisits(OPEN, s.store, s.expo, s.log);
  assert.equal(s.sent.length, 0);
  assert.deepEqual(s.marks, [["s1", "skipped"]]);
  assert.equal(r.skipped, 1);

  const s2 = setup({ devices: { u1: ["tokA", "tokB"], u2: ["tokOther"] } });
  await dispatchRevisits(OPEN, s2.store, s2.expo, s2.log);
  assert.deepEqual(s2.sent[0].map((m) => m.to), ["tokA", "tokB"]);
});

test("08:30 전엔 그대로 두고, 21:00 넘으면 skipped", async () => {
  const e = setup();
  await dispatchRevisits(EARLY, e.store, e.expo, e.log);
  assert.equal(e.sent.length, 0);
  assert.deepEqual(e.marks, []);

  const l = setup();
  await dispatchRevisits(LATE, l.store, l.expo, l.log);
  assert.equal(l.sent.length, 0);
  assert.deepEqual(l.marks, [["s1", "skipped"]]);
});

test("설정 꺼짐이면 skipped, 발송 0", async () => {
  const s = setup({ pref: { u1: false } });
  await dispatchRevisits(OPEN, s.store, s.expo, s.log);
  assert.equal(s.sent.length, 0);
  assert.deepEqual(s.marks, [["s1", "skipped"]]);
});

test("DeviceNotRegistered 티켓·영수증의 토큰을 끈다", async () => {
  const s = setup({
    devices: { u1: ["tokA", "tokB"] },
    tickets: () => [{ status: "ok", id: "x1" }, { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }],
    unchecked: [{ sendId: 9, tickets: [{ id: "old1", token: "tokOld" }, { id: "old2", token: "tokFine" }] }],
    receipts: { old1: { status: "error", details: { error: "DeviceNotRegistered" } }, old2: { status: "ok" } },
  });
  const r = await dispatchRevisits(OPEN, s.store, s.expo, s.log);
  assert.deepEqual(s.disabled, [["tokB"], ["tokOld"]]);
  assert.deepEqual(s.saved[0].tickets, [{ id: "x1", token: "tokA" }]);
  assert.deepEqual(s.checked, [[9]]);
  assert.deepEqual(s.marks, [["s1", "sent"]]);
  assert.equal(r.disabled, 2);
});

test("알림 data.path 는 그 리딩 결과 경로", async () => {
  const s = setup();
  await dispatchRevisits(OPEN, s.store, s.expo, s.log);
  assert.equal(s.sent[0][0].data.path, "/tarot/result?id=r1");
  assert.equal(s.sent[0][0].data.kind, "revisit");
});

test("발송이 통째로 실패하면 pending 으로 두고 선점을 풀어 다음 실행이 재시도한다", async () => {
  const s = setup({ sendThrows: true });
  const r1 = await dispatchRevisits(OPEN, s.store, s.expo, s.log);
  assert.deepEqual(s.marks, []);
  assert.equal(s.released, 1);
  assert.equal(r1.failed, 1);
  assert.equal(s.logs.length, 1);
  assert.match(String((s.logs[0].err as Error).message), /expo down/);
  assert.equal(s.logs[0].extra?.scheduleId, "s1");
  await dispatchRevisits(OPEN, s.store, s.expo, s.log);
  assert.equal(s.sent.length, 2); // 두 번째 실행이 다시 claim 해 시도했다
});

test("한 예약이 실패해도 다음 예약은 보낸다", async () => {
  const s = setup({
    due: [
      { id: "s1", userId: "u1", readingId: "r1", consultationType: "tarot", sendOn: "2026-11-10" },
      { id: "s2", userId: "u2", readingId: "r2", consultationType: "saju", sendOn: "2026-11-10" },
    ],
    devices: { u1: ["tokA"], u2: ["tokB"] },
  });
  let n = 0;
  const flaky: ExpoApi = { ...s.expo, send: async (m) => { if (n++ === 0) throw new Error("boom"); return s.expo.send(m); } };
  const r = await dispatchRevisits(OPEN, s.store, flaky, s.log);
  assert.equal(r.failed, 1);
  assert.equal(r.sent, 1);
  assert.equal(s.logs.length, 1);
  assert.equal(s.logs[0].extra?.scheduleId, "s1");
  assert.deepEqual(s.marks, [["s2", "sent"]]);
});

test("지원하지 않는 상담 종류는 skipped", async () => {
  const s = setup({ due: [{ id: "s1", userId: "u1", readingId: "r1", consultationType: "relationship", sendOn: "2026-11-10" }] });
  await dispatchRevisits(OPEN, s.store, s.expo, s.log);
  assert.equal(s.sent.length, 0);
  assert.deepEqual(s.marks, [["s1", "skipped"]]);
});

test("DeviceNotRegistered 가 아닌 티켓 오류는 코드별로 경고하고, ok 가 하나도 없으면 보낸 걸로 세지 않는다", async () => {
  const s = setup({
    devices: { u1: ["tokA", "tokB"] },
    tickets: () => [
      { status: "error", message: "bad creds", details: { error: "InvalidCredentials" } },
      { status: "error", message: "bad creds", details: { error: "InvalidCredentials" } },
    ],
  });
  const r = await dispatchRevisits(OPEN, s.store, s.expo, s.log, { warn: s.warn });
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  assert.deepEqual(s.marks, []); // pending 그대로 — 다음 실행이 다시 잡는다
  assert.equal(s.released, 1); // 통째 실패와 같게 선점을 푼다
  assert.deepEqual(s.saved, []);
  assert.deepEqual(s.disabled, []);
  assert.equal(s.warns.length, 1);
  assert.match(s.warns[0].message, /InvalidCredentials/);
  assert.equal(s.warns[0].extra?.code, "InvalidCredentials");
  assert.equal(s.warns[0].extra?.tickets, 2);
});

test("ok 가 하나라도 있으면 보낸 것 — 섞인 오류는 경고만", async () => {
  const s = setup({
    devices: { u1: ["tokA", "tokB"] },
    tickets: () => [{ status: "ok", id: "x1" }, { status: "error", message: "too big", details: { error: "MessageTooBig" } }],
  });
  const r = await dispatchRevisits(OPEN, s.store, s.expo, s.log, { warn: s.warn });
  assert.equal(r.sent, 1);
  assert.deepEqual(s.marks, [["s1", "sent"]]);
  assert.deepEqual(s.saved[0].tickets, [{ id: "x1", token: "tokA" }]);
  assert.equal(s.warns.length, 1);
  assert.equal(s.warns[0].extra?.code, "MessageTooBig");
});

test("영수증 오류(DeviceNotRegistered 말고)는 코드별로 한 번 경고한다", async () => {
  const s = setup({
    due: [],
    unchecked: [{ sendId: 9, tickets: [{ id: "a", token: "t1" }, { id: "b", token: "t2" }, { id: "c", token: "t3" }] }],
    receipts: {
      a: { status: "error", details: { error: "MessageRateExceeded" } },
      b: { status: "error", details: { error: "MessageRateExceeded" } },
      c: { status: "error", details: { error: "DeviceNotRegistered" } },
    },
  });
  const r = await dispatchRevisits(OPEN, s.store, s.expo, s.log, { warn: s.warn });
  assert.deepEqual(s.disabled, [["t3"]]);
  assert.equal(r.disabled, 1);
  assert.equal(s.warns.length, 1);
  assert.match(s.warns[0].message, /MessageRateExceeded/);
  assert.equal(s.warns[0].extra?.code, "MessageRateExceeded");
  assert.equal(s.warns[0].extra?.receipts, 2);
});

test("ok 없이 전부 DeviceNotRegistered 면 토큰을 끄고 선점을 풀며 보낸 걸로 세지 않는다", async () => {
  const s = setup({
    tickets: () => [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }],
  });
  const r = await dispatchRevisits(OPEN, s.store, s.expo, s.log, { warn: s.warn });
  assert.deepEqual(s.disabled, [["tokA"]]);
  assert.equal(r.disabled, 1);
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  assert.equal(s.released, 1);
  assert.deepEqual(s.marks, []);
  assert.deepEqual(s.warns, []); // 끊긴 기기는 정상 신호 — 경고하지 않는다
});

test("영수증이 아직 안 나온 티켓이 있는 발송은 확인 표시를 하지 않는다", async () => {
  const s = setup({
    due: [],
    unchecked: [
      { sendId: 9, tickets: [{ id: "a", token: "t1" }, { id: "b", token: "t2" }] },
      { sendId: 10, tickets: [{ id: "c", token: "t3" }] },
    ],
    receipts: { a: { status: "ok" }, c: { status: "ok" } }, // b 는 아직
  });
  await dispatchRevisits(OPEN, s.store, s.expo, s.log, { warn: s.warn });
  assert.deepEqual(s.checked, [[10]]);
});

test("시간 예산을 넘기면 새 예약을 시작하지 않는다 — 남은 건 pending 그대로", async () => {
  const s = setup({
    due: [
      { id: "s1", userId: "u1", readingId: "r1", consultationType: "tarot", sendOn: "2026-11-10" },
      { id: "s2", userId: "u2", readingId: "r2", consultationType: "saju", sendOn: "2026-11-10" },
    ],
    devices: { u1: ["tokA"], u2: ["tokB"] },
  });
  let t = 0;
  const slow: ExpoApi = { ...s.expo, send: async (m) => { const out = await s.expo.send(m); t = 50_000; return out; } };
  const r = await dispatchRevisits(OPEN, s.store, slow, s.log, { warn: s.warn, clock: () => t });
  assert.equal(r.sent, 1);
  assert.equal(s.sent.length, 1);
  assert.deepEqual(s.marks, [["s1", "sent"]]);
});
