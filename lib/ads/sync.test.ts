// 광고비 동기화 한 번(lib/ads/sync.ts) — 실패를 어느 수위로 남기는가.
// 10-25·10-29 prod: Meta 가 30초 뒤 code 2(Service temporarily unavailable)를 줘 그 시각 회차가 실패했고,
// 매시 cron 의 다음 회차가 같은 7일 창을 다시 읽어 메웠다(30일 467회 중 2회). 대시보드 adSyncAlert 가
// '최신 실행 실패'를 따로 띄우므로 이런 일시 장애는 error 가 아니라 warn — 토큰 만료 같은 영구 오류만 error.
// 의존성(@/lib/supabase · @/lib/logger · ./meta-insights)은 resolve 훅으로 ./sync.fakes.ts 로 바꿔 끼운다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import type * as Fakes from "./sync.fakes.ts";

process.env.META_ADS_ACCESS_TOKEN = "T";
process.env.META_AD_ACCOUNT_ID = "1";

// registerHooks 는 Node 22.15·23.5+ 에 있는데 설치된 @types/node(20) 엔 아직 타입이 없다 — 쓰는 모양만 선언한다.
type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./sync.fakes.ts", import.meta.url).href;
const FAKED = ["/lib/supabase.ts", "/lib/logger.ts", "/lib/ads/meta-insights.ts"];

type Sync = typeof import("./sync.ts");
type Loaded = { syncAdSpend: Sync["syncAdSpend"]; fakes: typeof Fakes };
let loaded: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        // 가짜 자신이 진짜 meta-insights 를 다시 내보내는 import 는 그대로 둔다 — 아니면 자기 자신을 import 한다
        if (context.parentURL === FAKES_URL) return r;
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { syncAdSpend } = await import("./sync.ts");
    return { syncAdSpend, fakes };
  })();
  return loaded;
}

const RANGE = { from: "2026-10-22", to: "2026-10-29", trigger: "cron" as const, adminId: null };

test("성공: Insights → 날짜 교체 RPC → 실행 기록 ok=true, 로그 없음", async () => {
  const { syncAdSpend, fakes } = await load();
  fakes.reset();
  fakes.state.insights = async () => [{ date_start: "2026-10-22", ad_name: "love", spend: "1200" }];
  const r = await syncAdSpend(RANGE);
  assert.deepEqual(r, { ok: true, rows: 8, days: 8 }, "응답 1행 + 응답 없는 7일 0원 행");
  assert.equal(fakes.state.rpcs[0].fn, "admin_ad_spend_replace_days");
  assert.equal(fakes.state.runUpdates.at(-1)?.row.ok, true);
  assert.deepEqual(fakes.state.logs, []);
});

test("Meta 일시 장애(재시도 소진·transient)는 warn — 다음 시각 cron 이 메운다", async () => {
  const { syncAdSpend, fakes } = await load();
  fakes.reset();
  fakes.state.insights = async () => {
    throw new fakes.MetaTransientError("Meta insights 실패 (HTTP 400, code 2): Service temporarily unavailable");
  };
  const r = await syncAdSpend(RANGE);
  assert.equal(r.ok, false);
  assert.deepEqual(fakes.state.rpcs, [], "실패면 광고비 표를 건드리지 않는다");
  assert.equal(fakes.state.runUpdates.at(-1)?.row.ok, false, "실행 기록엔 실패로 남는다(대시보드 신호)");
  assert.equal(fakes.state.logs.length, 1);
  assert.equal(fakes.state.logs[0].level, "warn");
  assert.match(fakes.state.logs[0].message, /code 2/);
  assert.deepEqual(fakes.state.logs[0].extra, { trigger: "cron", from: "2026-10-22", to: "2026-10-29", transient: true });
});

test("영구 오류(토큰 만료 등)는 그대로 error", async () => {
  const { syncAdSpend, fakes } = await load();
  fakes.reset();
  fakes.state.insights = async () => {
    throw new Error("Meta insights 실패 (HTTP 400, code 190): Invalid OAuth access token");
  };
  const r = await syncAdSpend(RANGE);
  assert.equal(r.ok, false);
  assert.equal(fakes.state.logs.length, 1);
  assert.equal(fakes.state.logs[0].level, "error");
  assert.match(fakes.state.logs[0].message, /code 190/);
  assert.deepEqual(fakes.state.logs[0].extra, { trigger: "cron", from: "2026-10-22", to: "2026-10-29" });
});
