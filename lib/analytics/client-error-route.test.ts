// 클라 에러 수집 라우트(app/api/log/error/route.ts) — 봇 UA 의 비콘을 사람 에러와 구분해 저장하는 계약.
// 2026-10-28 prod: Meta 크롤러(meta-externalagent)가 JS 를 돌리다 청크 로드를 끊어 `chunk-load-error` 가 사람 에러처럼 들어왔다.
// /api/pv 의 is_bot 과 같은 규칙 — 막지 않고 **표시만**(context.bot=true) 하고 저장한다. 필터는 어드민·분석 쿼리에서.
// 의존성(@/lib/supabase · @/lib/session)은 resolve 훅으로 ./client-error-route.fakes.ts 로 바꿔 끼운다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./client-error-route.fakes.ts";

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

const FAKES_URL = new URL("./client-error-route.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/session.ts"];

type Route = { POST: (request: NextRequest) => Promise<Response>; fakes: typeof Fakes };
let loaded: Promise<Route> | null = null;
function load(): Promise<Route> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { POST } = await import("@/app/api/log/error/route");
    return { POST, fakes };
  })();
  return loaded;
}

/** 2026-10-28 prod error_logs 원문 UA — 끝의 `(compatible; meta-externalagent/1.1 …crawler)` 가 봇 표시다 */
const META_CRAWLER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))";
const HUMAN_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1";

const CHUNK_CONTEXT = { kind: "chunk-load", dpl: "dpl_GwJLGHL9pYZW7CARuizKapGV37yN" };

function post(ua: string | null, body: Record<string, unknown>, ip = "203.0.113.7"): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip };
  if (ua !== null) headers["user-agent"] = ua;
  return new NextRequest("http://localhost:3000/api/log/error", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const chunkBody = (context?: unknown) => ({
  level: "warn",
  message: "Failed to load chunk /_next/static/chunks/13a7tqacl88mi.js?dpl=dpl_GwJLGHL9pYZW7CARuizKapGV37yN from module 64893",
  fingerprint: "chunk-load-error",
  route: "/byeolmaru/day",
  ...(context === undefined ? {} : { context }),
});

test("봇 UA 의 비콘은 저장하되 context.bot=true 로 표시한다 — 클라가 보낸 context 는 보존", async () => {
  const { POST, fakes } = await load();
  fakes.reset();
  const res = await POST(post(META_CRAWLER_UA, chunkBody(CHUNK_CONTEXT), "203.0.113.1"));
  assert.equal(res.status, 200, "봇이어도 막지 않는다(/api/pv 와 같은 규칙)");
  assert.equal(fakes.state.inserts.length, 1);
  const row = fakes.state.inserts[0].row;
  assert.equal(fakes.state.inserts[0].table, "error_logs");
  assert.deepEqual(row.context, { ...CHUNK_CONTEXT, bot: true });
  assert.equal(row.level, "warn", "level 은 그대로 — 표시만 한다");
  assert.equal(row.user_agent, META_CRAWLER_UA);
});

test("봇 UA 인데 클라가 context 를 안 보냈어도 표시는 남는다", async () => {
  const { POST, fakes } = await load();
  fakes.reset();
  await POST(post(META_CRAWLER_UA, chunkBody(), "203.0.113.2"));
  assert.deepEqual(fakes.state.inserts[0].row.context, { bot: true });
});

test("UA 가 아예 없으면 봇으로 본다(isBotUserAgent 와 같은 규칙)", async () => {
  const { POST, fakes } = await load();
  fakes.reset();
  await POST(post(null, chunkBody(CHUNK_CONTEXT), "203.0.113.3"));
  assert.deepEqual(fakes.state.inserts[0].row.context, { ...CHUNK_CONTEXT, bot: true });
});

test("사람 UA 는 context 를 손대지 않는다 — bot 키 자체가 없다(기존 행과 같은 모양)", async () => {
  const { POST, fakes } = await load();
  fakes.reset();
  await POST(post(HUMAN_UA, chunkBody(CHUNK_CONTEXT), "203.0.113.4"));
  assert.deepEqual(fakes.state.inserts[0].row.context, CHUNK_CONTEXT);

  fakes.reset();
  await POST(post(HUMAN_UA, chunkBody(), "203.0.113.5"));
  assert.equal(fakes.state.inserts[0].row.context, null, "context 없음은 null 그대로");
});
