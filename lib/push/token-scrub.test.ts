// 발송 기록의 푸시 토큰 — 처리 결과 확인이 끝나면 지우고 OS 구분만 남긴다(운영자 2026-11-22 알림-2C).
// 실제 저장소 + 실제 supabase-js 를 돌리고, 그 아래 fetch 만 메모리 PostgREST 로 바꾼다.
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { dispatchRevisits } from "./dispatch.ts";
import type { ExpoReceipt } from "./expo.ts";
import { supabaseDispatchStore as store } from "./store.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
/** 실패시킬 요청 — "메서드 표" */
let failing: Set<string>;

// eq·in·is.null·lt 만 안다 — 저장소가 여기서 쓰는 것 전부
function matches(row: Row, column: string, expr: string): boolean {
  const v = row[column];
  if (expr.startsWith("eq.")) return String(v) === expr.slice(3);
  if (expr === "is.null") return v === null;
  if (expr.startsWith("lt.")) return String(v) < expr.slice(3);
  if (expr.startsWith("in.(")) {
    return expr.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(v));
  }
  throw new Error(`fake db: unknown filter ${expr}`);
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const table = url.pathname.split("/").pop()!;
  const method = init?.method ?? "GET";
  if (table === "error_logs") return new Response(null, { status: 201 }); // 로거
  if (failing.has(`${method} ${table}`)) return Response.json({ message: "down" }, { status: 400 });
  let rows = tables[table];
  for (const [k, expr] of url.searchParams) {
    if (k !== "select" && k !== "order" && k !== "limit") rows = rows.filter((r) => matches(r, k, expr));
  }
  if (method === "GET") return Response.json(structuredClone(rows));
  if (method === "PATCH") {
    for (const r of rows) Object.assign(r, JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  }
  throw new Error(`fake db: unknown method ${method}`);
}) as typeof fetch;

const send = (id: number, tickets: unknown[]): Row => ({
  id,
  sent_at: "2026-11-22T00:00:00.000Z",
  receipt_checked_at: null,
  expo_tickets: tickets,
  device_count: tickets.length,
  opened_at: null,
});
const ios = { id: "t1", token: "tok-ios", platform: "ios" };
const android = { id: "t2", token: "tok-and", platform: "android" };

beforeEach(() => {
  failing = new Set();
  tables = {
    push_sends: [],
    push_devices: [
      { token: "tok-ios", platform: "ios", disabled_at: null },
      { token: "tok-and", platform: "android", disabled_at: null },
    ],
  };
});

test("보낼 때 기기 OS 를 티켓 옆에 남긴다", async () => {
  tables.push_sends = [send(1, [])];
  await store.saveTickets(1, [{ id: "t1", token: "tok-ios" }, { id: "t2", token: "tok-and" }]);
  assert.deepEqual(tables.push_sends[0].expo_tickets, [ios, android]);
  assert.equal(tables.push_sends[0].device_count, 2);
});

test("OS 조회가 실패해도 이미 나간 발송의 티켓은 남긴다", async (t) => {
  t.mock.method(console, "warn", () => {});
  tables.push_sends = [send(1, [])];
  failing.add("GET push_devices");
  await store.saveTickets(1, [{ id: "t1", token: "tok-ios" }]);
  assert.deepEqual(tables.push_sends[0].expo_tickets, [{ id: "t1", token: "tok-ios", platform: null }]);
  assert.equal(tables.push_sends[0].device_count, 1);
});

test("확인 처리하면 토큰·접수번호는 지우고 발송마다 제 OS 구분만 남긴다", async () => {
  tables.push_sends = [send(1, [ios, android]), send(2, [android]), send(3, [ios]), send(4, [])];
  await store.markReceiptsChecked([1, 2, 3, 4]);
  assert.deepEqual(tables.push_sends.map((r) => r.expo_tickets), [
    [{ platform: "ios" }, { platform: "android" }],
    [{ platform: "android" }],
    [{ platform: "ios" }],
    [],
  ]);
  assert.deepEqual(tables.push_sends.map((r) => r.device_count), [2, 1, 1, 0]);
  assert.ok(tables.push_sends.every((r) => r.receipt_checked_at !== null));
});

test("OS 없이 저장된 티켓도 토큰은 지운다", async () => {
  tables.push_sends = [send(1, [{ id: "t1", token: "tok-ios" }])];
  await store.markReceiptsChecked([1]);
  assert.deepEqual(tables.push_sends[0].expo_tickets, [{ platform: null }]);
});

test("확인 안 된 발송은 토큰을 그대로 둔다", async () => {
  tables.push_sends = [send(1, [ios]), send(2, [android])];
  await store.markReceiptsChecked([1]);
  assert.deepEqual(tables.push_sends[0].expo_tickets, [{ platform: "ios" }]);
  assert.deepEqual(tables.push_sends[1].expo_tickets, [android]);
  assert.equal(tables.push_sends[1].receipt_checked_at, null);
});

test("겹친 실행이 두 번 확인해도 OS 구분이 남는다", async () => {
  tables.push_sends = [send(1, [ios])];
  await store.markReceiptsChecked([1]);
  await store.markReceiptsChecked([1]);
  assert.deepEqual(tables.push_sends[0].expo_tickets, [{ platform: "ios" }]);
});

test("기록을 못 읽으면 던지고 확인 처리하지 않는다 — 다음 실행이 다시 지운다", async () => {
  tables.push_sends = [send(1, [ios])];
  failing.add("GET push_sends");
  await assert.rejects(store.markReceiptsChecked([1]), /markReceiptsChecked/);
  assert.equal(tables.push_sends[0].receipt_checked_at, null);
});

for (const c of [
  { name: "죽은 기기", now: "2026-11-22T01:00:00Z", receipts: { t1: { status: "error" as const, details: { error: "DeviceNotRegistered" } } }, off: true },
  { name: "24시간 지나도 영수증 없음", now: "2026-11-23T01:00:00Z", receipts: {}, off: false },
]) {
  test(`발송 cron 끝까지: ${c.name} → 토큰은 쓴 뒤에 지워진다`, async () => {
    tables.push_sends = [send(1, [ios])];
    await dispatchRevisits(
      new Date(c.now),
      { ...store, dueRevisits: async () => [] },
      { send: async () => [], receipts: async () => c.receipts as Record<string, ExpoReceipt> },
      (e) => assert.fail(String(e)),
      { warn: () => {} },
    );
    assert.equal(tables.push_devices[0].disabled_at !== null, c.off);
    assert.deepEqual(tables.push_sends[0].expo_tickets, [{ platform: "ios" }]);
  });
}
