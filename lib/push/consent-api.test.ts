// 설계 §8 — 광고 동의 라우트: 설정의 동의·철회와 결과 통지, 묻는 순간 판정, 수신거부 표 위조·재사용.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAskGet, handleSettingsGet, handleSettingsPost, handleUnsubscribePost, type SetConsentResult } from "./user-api.ts";
import { makeUnsubToken } from "./unsub-token.ts";

const SECRET = "x".repeat(40);

test("설정 — 광고 동의·철회는 결과 통지(날짜 형식)를 돌려준다. 바뀌지 않으면 통지 없음", async () => {
  const calls: unknown[] = [];
  let status: "none" | "granted" | "withdrawn" = "none";
  const deps = {
    setRevisitPref: async () => {},
    setAdConsent: async (u: string, grant: boolean, source: string): Promise<SetConsentResult> => {
      calls.push([u, grant, source]);
      const next = grant ? "granted" : status === "granted" ? "withdrawn" : status;
      const changed = next !== status;
      status = next;
      return { ok: true, changed, status, at: "2026-11-08T03:00:00Z" };
    },
  };
  assert.deepEqual(await handleSettingsPost({ ad: true, source: "settings" }, "u1", deps), {
    status: 200, body: { status: "granted", notice: { kind: "grant", date: "2026년 11월 8일" } },
  });
  assert.deepEqual(await handleSettingsPost({ ad: true, source: "settings" }, "u1", deps), { status: 200, body: { status: "granted", notice: null } });
  assert.deepEqual(await handleSettingsPost({ ad: false, source: "settings" }, "u1", deps), {
    status: 200, body: { status: "withdrawn", notice: { kind: "withdraw", date: "2026년 11월 8일" } },
  });
  // 순간 이름이 아닌 source, 수신거부 source(표 없이)는 거절
  assert.equal((await handleSettingsPost({ ad: true, source: "push" }, "u1", deps)).status, 400);
  assert.equal((await handleSettingsPost({ ad: false, source: "unsubscribe_button" }, "u1", deps)).status, 400);
  assert.equal((await handleSettingsPost({ ad: "yes", source: "settings" }, "u1", deps)).status, 400);
  assert.equal((await handleSettingsPost({ ad: true, source: "settings" }, null, deps)).status, 401);
  assert.equal(calls.length, 3);
});

test("설정 GET — 동의일과 2년 재확인 팝업 여부", async () => {
  const consent = { status: "granted" as const, firstGrantedAt: "2026-11-08T03:00:00Z", grantedAt: "2026-11-08T03:00:00Z", lastReconfirmNoticeAt: null };
  const deps = (now: string) => ({ getRevisitPref: async () => true, getAdConsent: async () => consent, now: () => new Date(now) });
  const early = await handleSettingsGet("u1", deps("2027-01-01T00:00:00Z"));
  assert.deepEqual(early.body, { revisit: true, ad: { status: "granted", grantedOn: "2026년 11월 8일", reconfirm: null } });
  const due = await handleSettingsGet("u1", deps("2028-10-20T00:00:00Z"));
  assert.deepEqual((due.body as { ad: { reconfirm: unknown } }).ad.reconfirm, { grantedOn: "2026년 11월 8일" });
  const none = await handleSettingsGet("u1", { getRevisitPref: async () => false, getAdConsent: async () => null, now: () => new Date() });
  assert.deepEqual(none.body, { revisit: false, ad: { status: "none", grantedOn: null, reconfirm: null } });
  assert.equal((await handleSettingsGet(null, deps("2027-01-01T00:00:00Z"))).status, 401);
});

test("재확인 팝업 기록", async () => {
  const rec: unknown[] = [];
  const deps = { setRevisitPref: async () => {}, recordReconfirmNotice: async (...a: unknown[]) => { rec.push(a); return true; } };
  assert.deepEqual(await handleSettingsPost({ reconfirmSeen: true }, "u1", deps), { status: 200, body: { ok: true } });
  assert.equal((await handleSettingsPost({ reconfirmSeen: "y" }, "u1", deps)).status, 400);
  assert.deepEqual(rec, [["u1", "reconfirm_popup"]]);
});

test("묻는 순간 GET — 서버가 기록·동의·구독으로 판정", async () => {
  let subCalls = 0;
  const deps = {
    listAsks: async () => [{ moment: "first_reading_end" as const, kind: "push" as const, answer: "accepted" as const }],
    getAdConsent: async () => null,
    isSubscriber: async () => { subCalls++; return false; },
  };
  const r = await handleAskGet({ moment: "byeolmaru_first", os: "granted" }, "u1", deps);
  assert.deepEqual(r.body, { moments: ["first_reading_end"], ask: "ad", ad: "none" });
  assert.equal(subCalls, 1);
  const noMoment = await handleAskGet({ moment: null, os: null }, "u1", deps);
  assert.deepEqual(noMoment.body, { moments: ["first_reading_end"], ask: null, ad: "none" });
  await handleAskGet({ moment: "birthday", os: "granted" }, "u1", deps);
  assert.equal(subCalls, 1); // 별마루 순간에서만 구독을 읽는다
  assert.equal((await handleAskGet({ moment: "birthday", os: "granted" }, null, deps)).status, 401);
});

test("수신거부 — 정상 표는 철회 + 통지, 같은 표 재사용은 409", async () => {
  const used = new Set<number>();
  const calls: unknown[] = [];
  const deps = {
    secret: SECRET,
    sendOwner: async (id: number) => (id === 7 ? { userId: "u1", klass: "ad" as const } : id === 8 ? { userId: "u1", klass: "info" as const } : null),
    setAdConsent: async (u: string, g: false, s: string, sendId: number): Promise<SetConsentResult> => {
      calls.push([u, g, s, sendId]);
      if (used.has(sendId)) return { ok: false, reason: "token_used" };
      used.add(sendId);
      return { ok: true, changed: true, status: "withdrawn", at: "2026-11-08T23:00:00Z" };
    },
  };
  const token = makeUnsubToken(7, "u1", SECRET);
  assert.deepEqual(await handleUnsubscribePost({ token, source: "unsubscribe_button" }, deps), {
    status: 200, body: { status: "withdrawn", notice: { kind: "withdraw", date: "2026년 11월 9일" } },
  });
  assert.deepEqual(await handleUnsubscribePost({ token, source: "unsubscribe_line" }, deps), { status: 409, body: { error: "used" } });
  assert.deepEqual(calls, [["u1", false, "unsubscribe_button", 7], ["u1", false, "unsubscribe_line", 7]]);
});

test("수신거부 — 위조·남의 표·광고 아닌 발송·모양 틀림은 403, 철회를 부르지 않는다", async () => {
  let called = 0;
  const deps = {
    secret: SECRET,
    sendOwner: async (id: number) => (id === 7 ? { userId: "u1", klass: "ad" as const } : id === 8 ? { userId: "u1", klass: "info" as const } : null),
    setAdConsent: async (): Promise<SetConsentResult> => { called++; return { ok: true, changed: true, status: "withdrawn", at: "2026-11-08T23:00:00Z" }; },
  };
  const good = makeUnsubToken(7, "u1", SECRET);
  const forged = [
    makeUnsubToken(7, "u2", SECRET), // 다른 회원으로 서명
    makeUnsubToken(7, "u1", "y".repeat(40)), // 다른 비밀값
    good.replace(/^v1\.7\./, "v1.9."), // 없는 발송
    makeUnsubToken(8, "u1", SECRET), // 정보성 발송
    good.slice(0, -1) + (good.endsWith("A") ? "B" : "A"),
    "v1.7.short",
    "",
    null,
  ];
  for (const token of forged) {
    assert.equal((await handleUnsubscribePost({ token, source: "unsubscribe_button" }, deps)).status, 403, String(token));
  }
  assert.equal((await handleUnsubscribePost({ token: good, source: "elsewhere" }, deps)).status, 400);
  assert.equal(called, 0);
});
