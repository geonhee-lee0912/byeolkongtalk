// 계약: 새 사주 상담을 만드는 길은 닫혔다(운영자 11-22 A). 지난 상담 보기·끝나지 않은 상담 마저 하기는 그대로.
// 별이 나가는 경로라 실제 라우트를 돌린다 — DB·세션·별·로거만 ./closed.fakes.ts 로 바꿔 끼운다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const FAKED = ["/lib/session.ts", "/lib/supabase.ts", "/lib/stars.ts", "/lib/logger.ts"];

let loaded: Promise<typeof Fakes> | null = null;
function loadFakes(): Promise<typeof Fakes> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    return (await import(FAKES_URL)) as typeof Fakes;
  })();
  return loaded;
}

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const CLOSED = { error: "사주 상담은 종료됐어", code: "SERVICE_CLOSED" };

test("새 사주 상담 — 410, 세션·DB·별보다 먼저", async () => {
  const fakes = await loadFakes();
  fakes.reset();
  const { POST } = await import("@/app/api/readings/route");
  const res = await POST(post("/api/readings", { question: "고민", sajuData: {} }));
  assert.equal(res.status, 410);
  assert.deepEqual(await res.json(), CLOSED);
  assert.deepEqual(fakes.state.calls, []);
});

const parent = (consultation_type: string) => ({
  id: "p1",
  user_id: "u1",
  consultation_type,
  has_sensitive: false,
  spread_type: "one_card",
  saju_data: {},
});

test("사주 이어가기 — 410, 대화·잔액·리딩·차감을 건드리지 않는다", async () => {
  const fakes = await loadFakes();
  const { POST } = await import("@/app/api/readings/continue/route");
  for (const mode of ["fresh", "deep"]) {
    fakes.reset(parent("saju"));
    const res = await POST(post("/api/readings/continue", { previousReadingId: "p1", mode, concern: "이어서" }));
    assert.equal(res.status, 410, mode);
    assert.deepEqual(await res.json(), CLOSED, mode);
    assert.deepEqual(fakes.state.calls, ["getSession", "select:readings"], mode);
  }
});

test("사주 이어가기 — 남의 리딩이면 종료 안내보다 소유권 거절이 먼저", async () => {
  const fakes = await loadFakes();
  const { POST } = await import("@/app/api/readings/continue/route");
  fakes.reset({ ...parent("saju"), user_id: "someone-else" });
  const res = await POST(post("/api/readings/continue", { previousReadingId: "p1", mode: "deep", concern: "이어서" }));
  assert.equal(res.status, 403);
});

test("타로 이어가기는 그대로 지나간다", async () => {
  const fakes = await loadFakes();
  const { POST } = await import("@/app/api/readings/continue/route");
  fakes.reset(parent("tarot"));
  const res = await POST(post("/api/readings/continue", { previousReadingId: "p1", mode: "deep", concern: "이어서" }));
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: string }).error, "parent_not_ended");
});

test("/saju · /saju/concern 은 사주 운세로 보낸다", () => {
  for (const f of ["app/(consultations)/saju/page.tsx", "app/(consultations)/saju/concern/page.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.ok(!s.includes('"use client"'), f);
    assert.match(s, /redirect\("\/fortune"\)/, f);
  }
});

test("지난 사주 결과에 새로 만드는 버튼이 없고, 마저 하기는 남는다", () => {
  const s = readFileSync("app/(consultations)/saju/result/page.tsx", "utf8");
  for (const gone of ["RechargeBlock", "ContinuationModal", 'href="/saju"', "새 사주"]) {
    assert.ok(!s.includes(gone), gone);
  }
  assert.ok(s.includes("/saju/reading?id=${reading.id}"));
});

test("마저 하기(대화·연장) 라우트는 닫지 않는다", () => {
  for (const f of ["app/api/consultations/saju/chat/route.ts", "app/api/readings/[id]/extend/route.ts"]) {
    assert.ok(!readFileSync(f, "utf8").includes("sajuConsultClosedResponse"), f);
  }
});

test("대화 속 사주 상담 추천 카드는 안 그린다", async () => {
  const { isRecoAttachable } = await import("../reco-utils.ts");
  for (const p of ["saju:good_days", "saju:nature", "saju:choice", "continue"] as const) {
    assert.equal(isRecoAttachable(p), false, p);
  }
  for (const p of ["tarot:relationship_5", "tarot:clarifier", "extend"] as const) {
    assert.equal(isRecoAttachable(p), true, p);
  }
  // 새 답·복원 두 자리 모두
  for (const f of ["app/tarot/reading/page.tsx", "app/(consultations)/saju/reading/page.tsx"]) {
    assert.equal(readFileSync(f, "utf8").match(/!isRecoAttachable\(r?p\)/g)?.length, 2, f);
  }
});
