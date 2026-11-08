import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRevisitPost, handleRevisitGet, handleAskPost, handleSettingsPost } from "./user-api.ts";
import { readingOwner } from "./store.ts";

test("남의 리딩 403, 없는 리딩 403, 이상한 choice 400", async () => {
  const deps = {
    readingOwner: async (id: string) => (id === "mine" ? "u1" : id === "theirs" ? "u2" : null),
    upsertRevisit: async () => "ok" as const,
    now: () => new Date("2026-11-06T03:00:00Z"),
  };
  assert.equal((await handleRevisitPost({ readingId: "theirs", choice: "3d" }, "u1", deps)).status, 403);
  assert.equal((await handleRevisitPost({ readingId: "ghost", choice: "3d" }, "u1", deps)).status, 403);
  assert.equal((await handleRevisitPost({ readingId: "mine", choice: "5d" }, "u1", deps)).status, 400);
  assert.equal((await handleRevisitPost({ readingId: "mine", choice: "3d" }, null, deps)).status, 401);
});

test("정상 예약은 KST 날짜를 돌려주고, 이미 보낸 건 409", async () => {
  const base = { readingOwner: async () => "u1", now: () => new Date("2026-11-06T03:00:00Z") };
  const ok = await handleRevisitPost({ readingId: "mine", choice: "1w" }, "u1", { ...base, upsertRevisit: async () => "ok" as const });
  assert.deepEqual(ok, { status: 200, body: { sendOn: "2026-11-13" } });
  const sent = await handleRevisitPost({ readingId: "mine", choice: "1w" }, "u1", { ...base, upsertRevisit: async () => "already_sent" as const });
  assert.equal(sent.status, 409);
  assert.deepEqual(sent.body, { error: "already_sent" });
});

test("asks 는 정해진 순간·종류·답만 받는다", async () => {
  const rec: unknown[] = [];
  const deps = { recordAsk: async (...a: unknown[]) => { rec.push(a); } };
  assert.equal((await handleAskPost({ moment: "somewhere", answer: "later" }, "u1", deps)).status, 400);
  assert.equal((await handleAskPost({ moment: "birthday", kind: "promo", answer: "later" }, "u1", deps)).status, 400);
  assert.equal((await handleAskPost({ moment: "first_reading_end", answer: "maybe" }, "u1", deps)).status, 400);
  assert.equal((await handleAskPost({ moment: "first_reading_end", answer: "later" }, null, deps)).status, 401);
  assert.equal(rec.length, 0);
  assert.equal((await handleAskPost({ moment: "first_reading_end", answer: "later" }, "u1", deps)).status, 200);
  assert.equal((await handleAskPost({ moment: "birthday", kind: "ad", answer: "accepted" }, "u1", deps)).status, 200);
  assert.deepEqual(rec, [["u1", "first_reading_end", "push", "later"], ["u1", "birthday", "ad", "accepted"]]);
});

test("settings 는 boolean 만 받는다", async () => {
  const rec: unknown[] = [];
  const deps = { setRevisitPref: async (...a: unknown[]) => { rec.push(a); } };
  assert.equal((await handleSettingsPost({ revisit: "yes" }, "u1", deps)).status, 400);
  assert.equal((await handleSettingsPost({ revisit: false }, null, deps)).status, 401);
  assert.deepEqual(await handleSettingsPost({ revisit: false }, "u1", deps), { status: 200, body: { ok: true } });
  assert.deepEqual(rec, [["u1", false]]);
});

test("readingOwner 는 UUID 모양이 아니면 DB 를 부르지 않고 null", async () => {
  const db = { from() { throw new Error("db touched"); } } as never;
  assert.equal(await readingOwner("ghost", db), null);
});

test("GET 다시 볼 날은 예약과 함께 설정(revisitPref)을 돌려주고, 남의·없는 리딩은 403", async () => {
  const deps = {
    readingOwner: async (id: string) => (id === "mine" ? "u1" : id === "theirs" ? "u2" : null),
    getRevisit: async () => ({ sendOn: "2026-11-13", status: "pending" }),
    getRevisitPref: async () => false,
  };
  assert.deepEqual(await handleRevisitGet("mine", "u1", deps), {
    status: 200,
    body: { revisit: { sendOn: "2026-11-13", status: "pending" }, revisitPref: false },
  });
  const none = await handleRevisitGet("mine", "u1", { ...deps, getRevisit: async () => null, getRevisitPref: async () => true });
  assert.deepEqual(none.body, { revisit: null, revisitPref: true });
  assert.equal((await handleRevisitGet("theirs", "u1", deps)).status, 403);
  assert.equal((await handleRevisitGet("ghost", "u1", deps)).status, 403);
  assert.equal((await handleRevisitGet("mine", null, deps)).status, 401);
});
