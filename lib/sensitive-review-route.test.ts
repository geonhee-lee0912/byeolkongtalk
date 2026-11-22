// 위기 알림 검토(app/api/admin/sensitive/[id]/review) — 오탐 처리로 공유 차단을 푸는 조건(운영자 결정 애플-4-1-1A).
// 1년 지난 알림은 파기되므로, 1년 넘은 상담은 '남은 알림 0'이어도 진짜 위기가 있었을 수 있다 → 자동으로 풀지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./sensitive-review-route.fakes.ts";

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

const FAKES_URL = new URL("./sensitive-review-route.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/admin-actions.ts"];

type Post = (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
let loaded: Promise<{ POST: Post; fakes: typeof Fakes }> | null = null;
function load() {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { POST } = await import("@/app/api/admin/sensitive/[id]/review/route");
    return { POST, fakes };
  })();
  return loaded;
}

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const CASES = [
  { title: "1년 안 상담·남은 알림 0 → 푼다", age: 30, unblock: true },
  { title: "364일 된 상담 → 푼다", age: 364, unblock: true },
  { title: "366일 된 상담 → 안 푼다(알림이 파기됐을 수 있다)", age: 366, unblock: false },
  { title: "3년 된 상담 → 안 푼다", age: 1095, unblock: false },
  { title: "남은 알림이 있으면 안 푼다", age: 30, others: 1, unblock: false },
  { title: "상담을 못 읽으면 안 푼다", age: 30, readingError: true, unblock: false },
  { title: "상담 행이 없으면 안 푼다", age: null, unblock: false },
  { title: "오탐이 아니면 안 푼다", age: 30, action: "contacted", unblock: false },
] as { title: string; age: number | null; others?: number; readingError?: boolean; action?: string; unblock: boolean }[];

for (const c of CASES) {
  test(c.title, async () => {
    const { POST, fakes } = await load();
    Object.assign(fakes.state, {
      readingCreatedAt: c.age === null ? null : ago(c.age),
      readingError: !!c.readingError,
      otherAlerts: c.others ?? 0,
      readingPatches: [],
    });
    const res = await POST(
      new NextRequest("http://localhost/api/admin/sensitive/a1/review", {
        method: "POST",
        body: JSON.stringify({ action: c.action ?? "false_positive" }),
      }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(fakes.state.readingPatches, c.unblock ? [{ has_sensitive: false }] : []);
  });
}
