// 계약: 사주 상담은 종료돼 만드는 API 가 410 이다(운영자 11-22). 끝나지 않은 상담은 마저 할 수 있어
// QA 는 시험 상담을 dev DB 에 바로 심는다 — 닫힌 API 를 안 부르고, 별도 안 깎는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import type * as Fakes from "./saju-seed.fakes.ts";

type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;
const FAKES_URL = new URL("./saju-seed.fakes.ts", import.meta.url).href;

let loaded: Promise<typeof Fakes> | null = null;
function loadFakes(): Promise<typeof Fakes> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return r.url.endsWith("/lib/supabase.ts") ? { ...r, url: FAKES_URL } : r;
      },
    });
    return (await import(FAKES_URL)) as typeof Fakes;
  })();
  return loaded;
}

const SAJU = { day: { stem: "신", branch: "축" } };

async function create(product: string, fail = false) {
  const fakes = await loadFakes();
  fakes.state.inserts = [];
  fakes.state.fail = fail;
  const { createSajuReading } = await import("./readings.ts");
  const { sajuCases } = await import("./cases/saju.ts");
  const c = sajuCases().find((x) => x.product.kind === "saju" && x.product.sajuProduct === product)!;
  const called: string[] = [];
  const real = globalThis.fetch;
  // 실제 서버처럼 — 계산은 열려 있고 만드는 API 는 닫혀 있다
  globalThis.fetch = (async (url: string) => {
    const path = new URL(url).pathname;
    called.push(path);
    return path === "/api/consultations/saju/calc"
      ? Response.json({ saju: SAJU })
      : Response.json({ code: "SERVICE_CLOSED" }, { status: 410 });
  }) as typeof fetch;
  try {
    return { c, called, inserts: fakes.state.inserts, made: await createSajuReading(c) };
  } finally {
    globalThis.fetch = real;
  }
}

test("닫힌 API 대신 DB 에 심는다 — 차감 0", async () => {
  const { c, called, inserts, made } = await create("today_letters");
  assert.deepEqual(called, ["/api/consultations/saju/calc"]);
  assert.deepEqual(made, { readingId: "seeded-1", cost: 0 });
  assert.equal(inserts.length, 1);
  const { table, row } = inserts[0];
  assert.equal(table, "readings");
  assert.equal(row.consultation_type, "saju");
  assert.equal(row.saju_product, "today_letters");
  assert.equal(row.question, c.seedConcern);
  assert.equal(row.emotion_tag, c.emotion);
  assert.equal(row.stars_spent, 0);
  assert.ok(row.prompt_version);
});

test("대화가 읽는 오늘의 기둥이 같이 들어간다 — 좋은 날만 30일치", async () => {
  const { calcTemporalLuck, baseDateForKst } = await import("../lib/saju/calc.ts");
  const { kstDate } = await import("../lib/admin-time.ts");
  const base = baseDateForKst(kstDate(new Date().toISOString()));
  for (const product of ["today_letters", "good_days"]) {
    const { inserts } = await create(product);
    assert.deepEqual(inserts[0].row.saju_data, {
      ...SAJU,
      temporal: calcTemporalLuck(base, 1995, { includeMonth: product === "good_days" }),
    });
  }
});

test("심기에 실패하면 조용히 넘기지 않는다", async () => {
  await assert.rejects(create("nature", true), /boom/);
});
