// 보유 기간 만료 파기 cron(app/api/cron/retention-purge) — 되돌릴 수 없는 삭제라 '켜기 전엔 세기만'을 잠근다.
// 실제 라우트를 돌리고 DB·로거만 ./retention-purge-cron.fakes.ts 로 바꿔 끼운다. 지우는 조건 자체는 SQL 함수 몫.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./retention-purge-cron.fakes.ts";

// registerHooks 는 Node 22.15·23.5+ 에 있는데 설치된 @types/node(20) 엔 아직 타입이 없다 — 쓰는 모양만 선언한다.
type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./retention-purge-cron.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/logger.ts"];

let loaded: Promise<{ GET: (request: NextRequest) => Promise<Response>; fakes: typeof Fakes }> | null = null;
function load() {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { GET } = await import("@/app/api/cron/retention-purge/route");
    return { GET, fakes };
  })();
  return loaded;
}

const counts = (executed: boolean, n: number) => ({ executed, withdrawals: n, bonus_claims: n, sensitive_alerts: 0, log_ip_ua: n });

type Env = { CRON_SECRET?: string; RETENTION_PURGE?: string };
async function run(env: Env, authorization: string | null, result: typeof Fakes.state.result) {
  const { GET, fakes } = await load();
  fakes.reset(result);
  const keys = ["CRON_SECRET", "RETENTION_PURGE"] as const;
  const saved = keys.map((k) => process.env[k]);
  for (const k of keys) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    const res = await GET(
      new NextRequest("http://localhost/api/cron/retention-purge", { headers: authorization ? { authorization } : {} }),
    );
    return { status: res.status, body: await res.json(), state: fakes.state };
  } finally {
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
}

const SECRET = "test-cron-secret";
const AUTH = `Bearer ${SECRET}`;

for (const [title, env, auth] of [
  ["시크릿 설정이 없으면", { RETENTION_PURGE: "on" }, "Bearer undefined"],
  ["헤더가 없으면", { CRON_SECRET: SECRET, RETENTION_PURGE: "on" }, null],
  ["시크릿이 틀리면", { CRON_SECRET: SECRET, RETENTION_PURGE: "on" }, "Bearer wrong"],
] as const) {
  test(`${title} 401 — DB 를 안 부른다`, async () => {
    const r = await run(env, auth, { data: counts(true, 1), error: null });
    assert.equal(r.status, 401);
    assert.deepEqual(r.state.calls, []);
  });
}

for (const value of [undefined, "", "off", "true", "1", "ON", " on"]) {
  test(`RETENTION_PURGE=${JSON.stringify(value)} 이면 세기만`, async () => {
    const r = await run({ CRON_SECRET: SECRET, RETENTION_PURGE: value }, AUTH, { data: counts(false, 3), error: null });
    assert.equal(r.status, 200);
    assert.deepEqual(r.state.calls, [{ fn: "purge_expired_records", args: { p_execute: false } }]);
    assert.deepEqual(r.body, counts(false, 3));
    assert.deepEqual(r.state.logs, [], "세기만 한 날은 기록을 남기지 않는다");
  });
}

test('RETENTION_PURGE="on" 이면 지우고, 지운 건수를 info 로 남긴다', async () => {
  const r = await run({ CRON_SECRET: SECRET, RETENTION_PURGE: "on" }, AUTH, { data: counts(true, 2), error: null });
  assert.equal(r.status, 200);
  assert.deepEqual(r.state.calls, [{ fn: "purge_expired_records", args: { p_execute: true } }]);
  assert.deepEqual(r.body, counts(true, 2));
  assert.equal(r.state.logs.length, 1);
  assert.equal(r.state.logs[0].level, "info");
  assert.deepEqual(r.state.logs[0].ctx, { route: "/api/cron/retention-purge", extra: counts(true, 2) });
});

test("지운 것이 없으면 기록을 남기지 않는다", async () => {
  const r = await run({ CRON_SECRET: SECRET, RETENTION_PURGE: "on" }, AUTH, { data: counts(true, 0), error: null });
  assert.equal(r.status, 200);
  assert.deepEqual(r.state.logs, []);
});

test("DB 오류는 500 + error — 조용히 성공으로 접지 않는다", async () => {
  const error = { message: "purge_expired_records: unknown login provider", code: "P0001" };
  const r = await run({ CRON_SECRET: SECRET, RETENTION_PURGE: "on" }, AUTH, { data: null, error });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, "purge_failed");
  assert.equal(r.state.logs.length, 1);
  assert.equal(r.state.logs[0].level, "error");
  assert.deepEqual(r.state.logs[0].what, error);
});

test("vercel.json 이 이 라우트를 하루 한 번 부른다", () => {
  const { crons } = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  const mine = crons.filter((c) => c.path === "/api/cron/retention-purge");
  assert.equal(mine.length, 1);
  assert.match(mine[0].schedule, /^\d{1,2} \d{1,2} \* \* \*$/);
});
