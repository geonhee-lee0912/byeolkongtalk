// 우리 사이·연애 시뮬 종료(2026-11-21) — 별이 나가거나 AI 를 부르는 쓰기 라우트가 410 으로 거절하는 계약.
// 실제 라우트를 불러 확인한다. @/lib/supabase · @/lib/session 은 resolve 훅으로 ./closed.fakes.ts 로 바꿔 끼우고,
// 가짜는 불리기만 해도 기록하고 던진다 → "세션·DB·별 차감보다 먼저 거절"을 실물로 잠근다.
// 읽기(GET)·수정(PATCH)은 마이 화면이 쓰니 여기서 막지 않는다(lib/relationship/closed.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./closed.fakes.ts";

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

const FAKES_URL = new URL("./closed.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/session.ts"];

type Post = (request: NextRequest) => Promise<Response>;

/** 거절해야 하는 쓰기 라우트 — 새 상대 등록·상담·이용권 구매/연장·상대 칸 구매·시뮬 시작/대화/피드백. */
const CLOSED_POST_ROUTES: Record<string, () => Promise<{ POST: Post }>> = {
  "/api/relationship": () => import("@/app/api/relationship/route"),
  "/api/relationship/chat": () => import("@/app/api/relationship/chat/route"),
  "/api/relationship/pass": () => import("@/app/api/relationship/pass/route"),
  "/api/relationship/extend": () => import("@/app/api/relationship/extend/route"),
  "/api/relationship/slot": () => import("@/app/api/relationship/slot/route"),
  "/api/relationship/sim": () => import("@/app/api/relationship/sim/route"),
  "/api/relationship/sim/chat": () => import("@/app/api/relationship/sim/chat/route"),
  "/api/relationship/sim/feedback": () => import("@/app/api/relationship/sim/feedback/route"),
};

let fakesLoaded: Promise<typeof Fakes> | null = null;
function loadFakes(): Promise<typeof Fakes> {
  fakesLoaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    return (await import(FAKES_URL)) as typeof Fakes;
  })();
  return fakesLoaded;
}

for (const [path, load] of Object.entries(CLOSED_POST_ROUTES)) {
  test(`POST ${path} — 410 service_closed, 세션·DB 를 건드리지 않는다`, async () => {
    const fakes = await loadFakes();
    fakes.calls.length = 0;
    const { POST } = await load();
    const res = await POST(
      new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ relationshipId: "x", message: "안녕", kind: "day1" }),
      }),
    );
    assert.equal(res.status, 410);
    const body = (await res.json()) as { error?: string; code?: string };
    assert.equal(body.error, "service_closed");
    assert.equal(body.code, "SERVICE_CLOSED");
    assert.deepEqual(fakes.calls, [], "세션·DB 호출 없이 거절해야 한다");
  });
}

test("relationship API 폴더의 POST 는 전부 위 목록에 있다 — 새 쓰기 라우트가 조용히 열리지 않게", async () => {
  const fs = await import("node:fs");
  const nodePath = await import("node:path");
  const root = nodePath.resolve(new URL("../../app/api/relationship", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = nodePath.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts" && /export async function POST\(/.test(fs.readFileSync(p, "utf8"))) {
        const rel = nodePath.relative(root, nodePath.dirname(p)).split(nodePath.sep).join("/");
        found.push(rel ? `/api/relationship/${rel}` : "/api/relationship");
      }
    }
  };
  walk(root);
  assert.deepEqual(found.sort(), Object.keys(CLOSED_POST_ROUTES).sort());
});
