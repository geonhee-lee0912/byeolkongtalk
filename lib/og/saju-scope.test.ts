// 계약: 사주 공유 그림 주소는 사주 상담만 연다(운영자 11-22 시안18 A) — 실제 라우트를 돌리고 DB·글꼴 받기만 바꿔 끼운다.
// 운세는 표식(fortune:)으로 막는다 — fortuneTypeFromTag 는 설정에서 빠진 옛 종류를 운세로 못 알아본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { calcSaju } from "../saju/calc.ts";
import type * as Fakes from "./saju-scope.fakes.ts";

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

const FAKES_URL = new URL("./saju-scope.fakes.ts", import.meta.url).href;
const ID = "00000000-0000-4000-8000-000000000000";

type Route = { GET: (req: Request, ctx: { params: Promise<{ readingId: string }> }) => Promise<Response>; fakes: typeof Fakes };
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
    const { GET } = await import("@/app/api/og/saju/[readingId]/route");
    return { GET, fakes };
  })();
  return loaded;
}

const saju = calcSaju({ year: 1996, month: 5, day: 15, hour: 13, gender: "female" });
const base = { saju_data: saju, question: "고민", has_sensitive: false, consultation_type: "saju", emotion_tag: null };

async function call(reading: Record<string, unknown> | null) {
  const { GET, fakes } = await load();
  fakes.state.reading = reading;
  fakes.state.messages = [{ role: "assistant", content: "네 흐름은 천천히 열려." }];
  const realFetch = globalThis.fetch;
  // 글꼴 CDN 대신 저장소 글꼴 — 테스트가 네트워크를 안 탄다
  globalThis.fetch = (async (url: unknown) =>
    String(url).endsWith(".otf")
      ? new Response(new Uint8Array(readFileSync("public/fonts/Cafe24Ssurround.otf")))
      : new Response("", { status: 404 })) as typeof fetch;
  try {
    const res = await GET(new Request(`http://localhost/api/og/saju/${ID}`), { params: Promise.resolve({ readingId: ID }) });
    return { status: res.status, body: Buffer.from(await res.arrayBuffer().catch(() => new ArrayBuffer(0))) };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("사주 상담은 그림이 나온다", async () => {
  for (const emotion_tag of [null, "일·진로"]) {
    const r = await call({ ...base, emotion_tag });
    assert.equal(r.status, 200, String(emotion_tag));
    assert.equal(r.body.subarray(1, 4).toString(), "PNG", String(emotion_tag));
  }
});

test("사주 상담이 아니면 404", async () => {
  const closed: [string, Record<string, unknown> | null][] = [
    ["없는 리딩", null],
    ["운세", { ...base, emotion_tag: "fortune:saju_full" }],
    ["설정에서 빠진 옛 운세", { ...base, emotion_tag: "fortune:retired_kind" }],
    ["궁합", { ...base, emotion_tag: "fortune:compat", saju_data: { a: saju, b: saju } }],
    ["타로", { ...base, consultation_type: "tarot", saju_data: null }],
    ["우리 사이", { ...base, consultation_type: "relationship", saju_data: null }],
    ["연애 시뮬", { ...base, consultation_type: "relationship_sim", saju_data: { phase: "play" } }],
  ];
  for (const [name, reading] of closed) assert.equal((await call(reading)).status, 404, name);
});

test("민감 상담은 그대로 403", async () => {
  assert.equal((await call({ ...base, has_sensitive: true })).status, 403);
});
