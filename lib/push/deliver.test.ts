// 광고 발송에는 수신거부 표가 붙는다(data.unsub + 경로 #bku=), 채널·카테고리는 광고용. 표가 없으면 보내지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchRevisits, type DispatchStore, type DispatchJob } from "./dispatch.ts";
import type { ExpoMessage } from "./expo.ts";
import { verifyUnsubToken } from "./unsub-token.ts";

const SECRET = "s".repeat(40);

function harness() {
  const sent: ExpoMessage[][] = [];
  let released = 0;
  const store: DispatchStore = {
    dueRevisits: async () => [],
    activeDeviceTokens: async () => [],
    getRevisitPref: async () => true,
    claimSend: async () => 42,
    deliveredSend: async () => false,
    releaseSend: async () => { released++; },
    saveTickets: async () => {},
    markSchedule: async () => {},
    disableTokens: async () => {},
    uncheckedReceipts: async () => [],
    markReceiptsChecked: async () => {},
  };
  const expo = { send: async (m: ExpoMessage[]) => { sent.push(m); return m.map((_, i) => ({ status: "ok" as const, id: `t${i}` })); }, receipts: async () => ({}) };
  return { store, expo, sent, get released() { return released; } };
}

test("광고 — 표·채널·카테고리", async () => {
  const h = harness();
  const job: DispatchJob = async (ctx) => {
    await ctx.deliver({ userId: "u1", kind: "resume", klass: "ad", refId: "r", tokens: ["tokA"], path: "/", message: { title: "(광고) t", body: "(광고) b" } });
  };
  await dispatchRevisits(new Date("2026-11-08T10:00:00Z"), h.store, h.expo, () => {}, { warn: () => {}, jobs: [job], unsubSecret: SECRET });
  const m = h.sent[0][0];
  assert.equal(m.channelId, "ad");
  assert.equal(m.categoryId, "ad");
  assert.ok(m.data.unsub && verifyUnsubToken(m.data.unsub, "u1", SECRET));
  assert.equal(m.data.path, `/#bkp=42&bku=${m.data.unsub}`);
  assert.equal(m.data.sendId, 42);
});

test("광고 — 표를 못 만들면(비밀값 없음) 보내지 않고 선점을 푼다", async () => {
  const h = harness();
  const logs: unknown[] = [];
  const job: DispatchJob = async (ctx) => {
    await ctx.deliver({ userId: "u1", kind: "resume", klass: "ad", refId: "r", tokens: ["tokA"], path: "/", message: { title: "t", body: "b" } });
  };
  await dispatchRevisits(new Date("2026-11-08T10:00:00Z"), h.store, h.expo, (e) => { logs.push(e); }, { warn: () => {}, jobs: [job], unsubSecret: "short" });
  assert.equal(h.sent.length, 0);
  assert.equal(h.released, 1);
  assert.equal(logs.length, 1);
});

test("정보성 — 열람 표식만 붙고 표·광고 채널은 없다", async () => {
  const h = harness();
  const job: DispatchJob = async (ctx) => {
    await ctx.deliver({ userId: "u1", kind: "morning", klass: "info", refId: "d", tokens: ["tokA"], path: "/byeolmaru/day", message: { title: "t", body: "b" } });
  };
  await dispatchRevisits(new Date("2026-11-08T00:00:00Z"), h.store, h.expo, () => {}, { warn: () => {}, jobs: [job], unsubSecret: SECRET });
  const m = h.sent[0][0];
  assert.equal(m.data.path, "/byeolmaru/day#bkp=42");
  assert.equal(m.data.unsub, undefined);
  assert.equal(m.channelId, "info");
  assert.equal(m.categoryId, undefined);
});

test("한 회원에게 기기 상한(5)까지만 보낸다", async () => {
  const h = harness();
  const job: DispatchJob = async (ctx) => {
    await ctx.deliver({ userId: "u1", kind: "revisit", klass: "info", refId: "r", tokens: Array.from({ length: 9 }, (_, i) => `tok${i}`), path: "/", message: { title: "t", body: "b" } });
  };
  await dispatchRevisits(new Date("2026-11-08T03:00:00Z"), h.store, h.expo, () => {}, { warn: () => {}, jobs: [job], unsubSecret: SECRET });
  assert.equal(h.sent[0].length, 5);
});
