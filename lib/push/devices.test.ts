import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleDevicePost, handleDeviceDelete } from "./devices.ts";
import { upsertDevice, activeDeviceTokens } from "./store.ts";

test("비로그인 401, 이상한 토큰 400, 정상은 upsert", async () => {
  const calls: unknown[] = [];
  const store = { upsertDevice: async (d: unknown) => { calls.push(d); } };
  assert.equal((await handleDevicePost({ token: "ExponentPushToken[abc]", platform: "ios" }, null, store)).status, 401);
  assert.equal((await handleDevicePost({ token: "nope", platform: "ios" }, "u1", store)).status, 400);
  assert.equal((await handleDevicePost({ token: "ExponentPushToken[abc]", platform: "web" }, "u1", store)).status, 400);
  assert.equal((await handleDevicePost({ token: "ExponentPushToken[abc]", platform: "android", appVersion: "1.1.0" }, "u1", store)).status, 200);
  assert.deepEqual(calls, [{ token: "ExponentPushToken[abc]", userId: "u1", platform: "android", appVersion: "1.1.0" }]);
});

test("삭제는 형식만 검사한다", async () => {
  const deleted: string[] = [];
  const store = { deleteDevice: async (t: string) => { deleted.push(t); } };
  assert.equal((await handleDeviceDelete({ token: "nope" }, store)).status, 400);
  assert.equal((await handleDeviceDelete({ token: "ExponentPushToken[abc]" }, store)).status, 200);
  assert.deepEqual(deleted, ["ExponentPushToken[abc]"]);
});

// push_devices 만 흉내 내는 작은 가짜 — onConflict 를 실제로 지키고, active 조회(eq user_id + is disabled_at null)만 지원한다.
function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const upserts: { row: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      assert.equal(table, "push_devices");
      return {
        upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
          upserts.push({ row, opts });
          if (opts.onConflict === "token") rows.set(row.token as string, { ...rows.get(row.token as string), ...row });
          else rows.set(`${rows.size}`, row);
          return { error: null };
        },
        select: () => {
          const f: Record<string, unknown> = {};
          const q = {
            eq: (c: string, v: unknown) => { f[c] = v; return q; },
            is: (c: string, v: null) => { f[`${c}:is`] = v; return q; },
            then: (res: (r: unknown) => void) =>
              res({
                error: null,
                data: [...rows.values()].filter((r) => r.user_id === f.user_id && r.disabled_at == null),
              }),
          };
          return q;
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, upserts };
}

test("같은 토큰을 u1 → u2 로 등록하면 u2 소유가 된다", async () => {
  const { db, upserts } = fakeDb();
  const d = { token: "ExponentPushToken[abc]", platform: "ios" as const, appVersion: null };
  await upsertDevice({ ...d, userId: "u1" }, db);
  await upsertDevice({ ...d, userId: "u2" }, db);
  assert.equal(upserts[1].opts.onConflict, "token");
  assert.equal(upserts[1].row.user_id, "u2");
  assert.equal(upserts[1].row.disabled_at, null);
  assert.deepEqual(await activeDeviceTokens("u1", db), []);
  assert.deepEqual(await activeDeviceTokens("u2", db), ["ExponentPushToken[abc]"]);
});
