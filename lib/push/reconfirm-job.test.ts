import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchRevisits, type DispatchStore } from "./dispatch.ts";
import type { ExpoMessage } from "./expo.ts";
import { reconfirmJob, type ReconfirmCandidate } from "./reconfirm-job.ts";

function run(now: Date, cands: ReconfirmCandidate[], devices: Record<string, string[]> = { u1: ["tokA"] }) {
  const sent: ExpoMessage[][] = [];
  const recorded: string[] = [];
  const claimed = new Set<string>();
  const store: DispatchStore = {
    dueRevisits: async () => [],
    activeDeviceTokens: async (u) => devices[u] ?? [],
    getRevisitPref: async () => true,
    claimSend: async (r) => { const k = `${r.userId}|${r.kind}|${r.refId}|${r.sendDate}`; if (claimed.has(k)) return null; claimed.add(k); return claimed.size; },
    deliveredSend: async () => true,
    releaseSend: async () => {},
    saveTickets: async () => {},
    markSchedule: async () => {},
    disableTokens: async () => {},
    uncheckedReceipts: async () => [],
    markReceiptsChecked: async () => {},
  };
  const expo = { send: async (m: ExpoMessage[]) => { sent.push(m); return m.map((_, i) => ({ status: "ok" as const, id: `t${i}` })); }, receipts: async () => ({}) };
  const job = reconfirmJob({ reconfirmCandidates: async () => cands, recordReconfirmNotice: async (u) => { recorded.push(u); return true; } });
  return { go: () => dispatchRevisits(now, store, expo, () => {}, { warn: () => {}, jobs: [job] }), sent, recorded };
}

const cand: ReconfirmCandidate = { userId: "u1", firstGrantedAt: "2024-11-12T03:00:00Z", grantedAt: "2024-11-12T03:00:00Z", lastReconfirmNoticeAt: null };

test("기한 7일 전부터, 낮 시간에 정보성으로 한 번 보내고 기록한다", async () => {
  const r = run(new Date("2026-11-08T01:00:00Z"), [cand]); // KST 10:00, 기한 11-12 의 4일 전
  await r.go();
  assert.equal(r.sent.length, 1);
  const m = r.sent[0][0];
  assert.equal(m.channelId, "info");
  assert.equal(m.categoryId, undefined);
  assert.equal(m.data.unsub, undefined);
  assert.equal(m.data.path, `/mypage/notifications#bkp=${m.data.sendId}`);
  assert.ok(m.body.includes("2024년 11월 12일"));
  assert.ok(!m.title.startsWith("(광고)"));
  assert.deepEqual(r.recorded, ["u1"]);
  await r.go(); // 같은 날 두 번째 실행 — 다시 안 보낸다
  assert.equal(r.sent.length, 1);
});

test("7일 전보다 이르면, 이미 팝업으로 알렸으면, 밤이면, 기기가 없으면 안 보낸다", async () => {
  for (const [now, c, dev] of [
    [new Date("2026-11-01T01:00:00Z"), cand, undefined],
    [new Date("2026-11-08T01:00:00Z"), { ...cand, lastReconfirmNoticeAt: "2026-10-20T00:00:00Z" }, undefined],
    [new Date("2026-11-08T13:00:00Z"), cand, undefined], // KST 22:00
    [new Date("2026-11-08T01:00:00Z"), cand, {}],
  ] as const) {
    const r = run(now, [c], dev as Record<string, string[]> | undefined);
    await r.go();
    assert.equal(r.sent.length, 0);
    assert.deepEqual(r.recorded, []);
  }
});
