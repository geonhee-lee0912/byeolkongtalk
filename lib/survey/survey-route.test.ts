// 설문(app/api/survey) 1인 1회 — 응답 행은 1년 뒤 파기된다(애플-4-3A). 그 뒤에도 보상 원장으로 '이미 참여'를 안다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./survey-route.fakes.ts";
import { SURVEY_QUESTIONS } from "./questions.ts";

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

const FAKES_URL = new URL("./survey-route.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/session.ts", "/lib/stars.ts", "/lib/logger.ts"];

type Route = { GET: () => Promise<Response>; POST: (request: NextRequest) => Promise<Response>; fakes: typeof Fakes };
let loaded: Promise<Route> | null = null;
function load() {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { GET, POST } = await import("@/app/api/survey/route");
    return { GET, POST, fakes };
  })();
  return loaded;
}

type Setup = { row?: boolean; rewarded?: boolean; ledgerError?: boolean };
async function setup(s: Setup) {
  const route = await load();
  Object.assign(route.fakes.state, { row: !!s.row, rewarded: !!s.rewarded, ledgerError: !!s.ledgerError, inserts: 0, charges: 0, logs: 0 });
  return route;
}

const answers = SURVEY_QUESTIONS.map((q) =>
  q.type === "multi" ? q.options[0].label : "충분히 긴 답변을 적어 둡니다. 스무 글자를 넘겨요.",
);
const post = () => new NextRequest("http://localhost/api/survey", { method: "POST", body: JSON.stringify({ answers }) });

test("처음이면 참여할 수 있다", async () => {
  const { GET } = await setup({});
  assert.deepEqual(await (await GET()).json(), { eligible: true, participated: false });
});

test("응답 행이 있으면 이미 참여", async () => {
  const { GET } = await setup({ row: true, rewarded: true });
  assert.deepEqual(await (await GET()).json(), { eligible: false, participated: true });
});

test("응답이 파기돼도 보상 원장이 있으면 이미 참여", async () => {
  const { GET } = await setup({ rewarded: true });
  assert.deepEqual(await (await GET()).json(), { eligible: false, participated: true });
});

test("원장을 못 읽으면 자격 없음", async () => {
  const { GET, fakes } = await setup({ ledgerError: true });
  assert.deepEqual(await (await GET()).json(), { eligible: false, participated: false });
  assert.equal(fakes.state.logs, 1);
});

test("처음 제출은 저장하고 보상", async () => {
  const { POST, fakes } = await setup({});
  assert.equal((await POST(post())).status, 200);
  assert.deepEqual([fakes.state.inserts, fakes.state.charges], [1, 1]);
});

test("행이 있으면 409", async () => {
  const { POST, fakes } = await setup({ row: true });
  assert.equal((await POST(post())).status, 409);
  assert.equal(fakes.state.charges, 0);
});

test("응답이 파기된 뒤 다시 제출해도 409 — 저장·보상 0", async () => {
  const { POST, fakes } = await setup({ rewarded: true });
  const res = await POST(post());
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { ok: false, reason: "already" });
  assert.deepEqual([fakes.state.inserts, fakes.state.charges], [0, 0]);
});

test("제출 때 원장을 못 읽으면 저장하지 않고 500", async () => {
  const { POST, fakes } = await setup({ ledgerError: true });
  assert.equal((await POST(post())).status, 500);
  assert.deepEqual([fakes.state.inserts, fakes.state.charges, fakes.state.logs], [0, 0, 1]);
});
