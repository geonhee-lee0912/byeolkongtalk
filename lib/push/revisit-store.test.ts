import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertRevisit } from "./store.ts";

type Row = { user_id: string; reading_id: string; kind: string; send_on: string; status: string };

// push_schedules 만 흉내 내는 작은 가짜 — eq 필터, update(.select), insert(unique reading_id+kind → 23505)
function fakeDb(rows: Row[]) {
  const db = {
    from(table: string) {
      assert.equal(table, "push_schedules");
      return {
        insert: async (row: Omit<Row, "status">) => {
          if (rows.some((r) => r.reading_id === row.reading_id && r.kind === row.kind)) {
            return { error: { code: "23505", message: "dup" } };
          }
          rows.push({ ...row, status: "pending" });
          return { error: null };
        },
        update: (patch: Partial<Row>) => {
          const f: Record<string, unknown> = {};
          const q = {
            eq: (c: string, v: unknown) => { f[c] = v; return q; },
            select: () => q,
            then: (res: (r: unknown) => void) => {
              const hit = rows.filter((r) => Object.entries(f).every(([c, v]) => (r as Record<string, unknown>)[c] === v));
              hit.forEach((r) => Object.assign(r, patch));
              res({ error: null, data: hit.map(() => ({ id: "x" })) });
            },
          };
          return q;
        },
        select: () => {
          const f: Record<string, unknown> = {};
          const q = {
            eq: (c: string, v: unknown) => { f[c] = v; return q; },
            maybeSingle: async () => {
              const r = rows.find((r) => Object.entries(f).every(([c, v]) => (r as Record<string, unknown>)[c] === v));
              return { error: null, data: r ? { send_on: r.send_on, status: r.status } : null };
            },
          };
          return q;
        },
      };
    },
  };
  return db as unknown as SupabaseClient;
}

const row = (o: Partial<Row> = {}): Row => ({ user_id: "u1", reading_id: "r1", kind: "revisit", send_on: "2026-11-09", status: "pending", ...o });

test("pending 이면 send_on 갱신 후 ok", async () => {
  const rows = [row()];
  assert.equal(await upsertRevisit("u1", "r1", "2026-11-13", fakeDb(rows)), "ok");
  assert.equal(rows[0].send_on, "2026-11-13");
});

test("sent 행은 건드리지 않고 already_sent", async () => {
  const rows = [row({ status: "sent" })];
  assert.equal(await upsertRevisit("u1", "r1", "2026-11-13", fakeDb(rows)), "already_sent");
  assert.equal(rows[0].send_on, "2026-11-09");
});

test("행이 없으면 만들고 ok", async () => {
  const rows: Row[] = [];
  assert.equal(await upsertRevisit("u1", "r1", "2026-11-13", fakeDb(rows)), "ok");
  assert.equal(rows.length, 1);
});

test("다른 사용자 소유 행과 부딪히면 ok 를 답하지 않고 그 행도 안 바꾼다", async () => {
  const rows = [row({ user_id: "u2" })];
  assert.notEqual(await upsertRevisit("u1", "r1", "2026-11-13", fakeDb(rows)), "ok");
  assert.equal(rows[0].send_on, "2026-11-09");
});
