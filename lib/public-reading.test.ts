// 계약: 공유 조회(/api/readings/[id]/public)는 공유 결과 화면이 있는 타로 상담·운세만(운영자 11-22 A) — 실제 라우트를 돌리고 DB 만 바꿔 끼운다.
// 운세는 표식(fortune:)으로 가른다 — fortuneTypeFromTag 는 설정에서 빠진 옛 종류를 못 알아본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import type * as Fakes from "./public-reading.fakes.ts";

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

const FAKES_URL = new URL("./public-reading.fakes.ts", import.meta.url).href;

type Route = { GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>; fakes: typeof Fakes };
let loaded: Promise<Route> | null = null;
function load(): Promise<Route> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return r.url.endsWith("/lib/supabase.ts") ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { GET } = await import("@/app/api/readings/[id]/public/route");
    return { GET, fakes };
  })();
  return loaded;
}

async function call(reading: Record<string, unknown>) {
  const { GET, fakes } = await load();
  fakes.state.reading = { id: "r1", question: "고민", has_sensitive: false, emotion_tag: null, ...reading };
  fakes.state.messages = [{ role: "assistant", content: "답", created_at: "2026-11-22T00:00:00Z" }];
  fakes.state.messageReads = 0;
  const res = await GET(new Request("http://localhost/api/readings/r1/public"), { params: Promise.resolve({ id: "r1" }) });
  return { status: res.status, body: await res.json(), messageReads: fakes.state.messageReads };
}

test("타로 상담·운세(사주 운세·옛 종류 포함)는 공유로 열린다", async () => {
  const open: [string, Record<string, unknown>][] = [
    ["타로 상담", { consultation_type: "tarot", emotion_tag: "걔 속마음이 궁금해" }],
    ["태그 없는 타로 상담", { consultation_type: "tarot" }],
    ["타로 운세", { consultation_type: "tarot", emotion_tag: "fortune:tarot_love" }],
    ["사주 운세", { consultation_type: "saju", emotion_tag: "fortune:saju_full" }],
    ["설정에서 빠진 옛 운세", { consultation_type: "saju", emotion_tag: "fortune:retired_kind" }],
  ];
  for (const [name, reading] of open) {
    const r = await call(reading);
    assert.equal(r.status, 200, name);
    assert.equal(r.body.messages.length, 1, name);
  }
});

test("공유 화면이 없는 종류는 404 — 대화를 읽지도 않는다", async () => {
  const closed: [string, Record<string, unknown>][] = [
    ["사주 상담", { consultation_type: "saju" }],
    ["태그 있는 사주 상담", { consultation_type: "saju", emotion_tag: "일·진로" }],
    ["관계", { consultation_type: "relationship" }],
    ["시뮬", { consultation_type: "relationship_sim" }],
    ["앞으로 생길 종류", { consultation_type: "new_kind" }],
  ];
  for (const [name, reading] of closed) {
    const r = await call(reading);
    assert.equal(r.status, 404, name);
    assert.deepEqual(r.body, { error: "not_found" }, name);
    assert.equal(r.messageReads, 0, name);
  }
});

test("민감 대화는 그대로 404", async () => {
  assert.equal((await call({ consultation_type: "tarot", has_sensitive: true })).status, 404);
});
