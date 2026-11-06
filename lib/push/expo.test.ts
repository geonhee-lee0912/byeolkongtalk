import { test } from "node:test";
import assert from "node:assert/strict";
import { getReceipts, sendExpo } from "./expo.ts";

const msg = (i: number) => ({
  to: `ExponentPushToken[${i}]`, title: "t", body: "b",
  data: { path: "/", kind: "revisit", sendId: 1 }, sound: "default" as const, channelId: "info" as const,
});

test("100개씩 나눠 보내고 티켓 순서를 지킨다", async () => {
  const bodies: unknown[][] = [];
  const f = (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    bodies.push(b);
    return new Response(JSON.stringify({ data: b.map((_: unknown, i: number) => ({ status: "ok", id: `t${bodies.length}-${i}` })) }));
  }) as typeof fetch;
  const t = await sendExpo(Array.from({ length: 150 }, (_, i) => msg(i)), f);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].length, 100);
  assert.equal(t.length, 150);
  assert.deepEqual(t[0], { status: "ok", id: "t1-0" });
  assert.deepEqual(t[100], { status: "ok", id: "t2-0" });
});

test("최상위 errors 면 던진다", async () => {
  const f = (async () => new Response(JSON.stringify({ errors: [{ code: "X" }] }), { status: 400 })) as typeof fetch;
  await assert.rejects(sendExpo([msg(1)], f));
});

test("EXPO_ACCESS_TOKEN 이 있을 때만 Authorization 을 싣는다", async () => {
  const seen: Record<string, string>[] = [];
  const f = (async (_u: string, init: RequestInit) => {
    seen.push(init.headers as Record<string, string>);
    return new Response(JSON.stringify({ data: [{ status: "ok", id: "a" }] }));
  }) as typeof fetch;
  const prev = process.env.EXPO_ACCESS_TOKEN;
  try {
    delete process.env.EXPO_ACCESS_TOKEN;
    await sendExpo([msg(1)], f);
    process.env.EXPO_ACCESS_TOKEN = "tok";
    await sendExpo([msg(1)], f);
  } finally {
    if (prev === undefined) delete process.env.EXPO_ACCESS_TOKEN; else process.env.EXPO_ACCESS_TOKEN = prev;
  }
  assert.equal(seen[0].Authorization, undefined);
  assert.equal(seen[1].Authorization, "Bearer tok");
});

test("영수증을 1000개씩 조회해 합친다", async () => {
  const sizes: number[] = [];
  const f = (async (_u: string, init: RequestInit) => {
    const { ids } = JSON.parse(String(init.body)) as { ids: string[] };
    sizes.push(ids.length);
    return new Response(JSON.stringify({ data: Object.fromEntries(ids.map((id) => [id, { status: "ok" }])) }));
  }) as typeof fetch;
  const r = await getReceipts(Array.from({ length: 1500 }, (_, i) => `r${i}`), f);
  assert.deepEqual(sizes, [1000, 500]);
  assert.equal(Object.keys(r).length, 1500);
});
