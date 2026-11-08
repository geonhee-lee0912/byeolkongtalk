import { test } from "node:test";
import assert from "node:assert/strict";
import { devicesOverCap, MAX_ACTIVE_DEVICES_PER_USER } from "./device-cap.ts";
import { handleDevicePost } from "./devices.ts";

test("기기 상한 — 최근 확인 순으로 남기고 나머지를 끈다", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ token: `t${i}`, lastSeenAt: `2026-11-0${i + 1}T00:00:00Z` }));
  assert.equal(MAX_ACTIVE_DEVICES_PER_USER, 5);
  assert.deepEqual(devicesOverCap(rows).sort(), ["t0", "t1", "t2"]);
  assert.deepEqual(devicesOverCap(rows.slice(0, 5)), []);
  // 같은 시각이면 토큰 순 — 결과가 늘 같다
  const same = ["c", "a", "b"].map((token) => ({ token, lastSeenAt: "2026-11-01T00:00:00Z" }));
  assert.deepEqual(devicesOverCap(same, 2), ["c"]);
});

test("등록하면 그 회원의 기기 상한을 맞춘다", async () => {
  const calls: string[] = [];
  const store = { upsertDevice: async () => { calls.push("upsert"); }, trimUserDevices: async (u: string) => { calls.push(`trim:${u}`); } };
  assert.equal((await handleDevicePost({ token: "ExponentPushToken[abc]", platform: "ios" }, "u1", store)).status, 200);
  assert.deepEqual(calls, ["upsert", "trim:u1"]);
});
