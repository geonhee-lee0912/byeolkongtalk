// compat-self-name.test.ts 전용 가짜 — 궁합 두 라우트의 DB·세션·별·이용권·AI·로그 자리에 들어간다(테스트의 resolve 훅).
// 프롬프트 조립·사주 계산은 진짜가 돈다. AI 자리는 받은 값을 남기고 일부러 못 읽는 답을 돌려준다(→ 재시도 프롬프트까지 잡는다).
export { NextRequest, NextResponse } from "next/server";

type Row = Record<string, unknown>;

export const state = {
  profiles: [] as Row[],
  relationship: null as Row | null,
  prompts: [] as string[],
  readings: [] as Row[],
  background: [] as (() => Promise<void>)[],
};

export function reset(): void {
  state.profiles = [];
  state.relationship = null;
  state.prompts = [];
  state.readings = [];
  state.background = [];
}

// ── next/server (운세 생성 라우트에서만) ──
export function after(job: () => Promise<void>): void {
  state.background.push(job);
}

// ── @/lib/supabase ── select 에 적힌 칸만 돌려준다(판정에 쓰는 칸을 조회에서 빠뜨리면 테스트가 잡는다)
function query(table: string) {
  let columns = "*";
  let op = "select";
  let ids: unknown[] | null = null;
  const project = (row: Row): Row =>
    columns === "*" ? row : Object.fromEntries(columns.split(",").map((c) => c.trim()).map((c) => [c, row[c]]));
  const rows = (): Row[] => {
    if (op !== "select") return [];
    if (table === "user_profiles") return state.profiles.filter((r) => !ids || ids.includes(r.id)).map(project);
    if (table === "relationships" && state.relationship) return [project(state.relationship)];
    return [];
  };
  const q = {
    select(c: string) {
      columns = c;
      return q;
    },
    in(_column: string, values: unknown[]) {
      ids = values;
      return q;
    },
    eq: () => q,
    insert(row: Row) {
      op = "insert";
      if (table === "readings") state.readings.push(row);
      return q;
    },
    update() {
      op = "update";
      return q;
    },
    delete() {
      op = "delete";
      return q;
    },
    single: async () => ({ data: op === "insert" ? { id: "reading" } : (rows()[0] ?? null), error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: <T>(resolve: (v: { data: Row[]; error: null }) => T) => Promise.resolve({ data: rows(), error: null }).then(resolve),
  };
  return q;
}
export function getServiceSupabase() {
  return { from: query };
}

// ── @/lib/session ──
export async function getSession() {
  return { userId: "test-user", anonymousId: null, isAuthenticated: true };
}

// ── @/lib/stars ──
export async function spendStars() {
  return { success: true, balance: 100 };
}
export async function chargeStars() {
  return { success: true, balance: 100 };
}
export async function getStarBalance() {
  return 100;
}

// ── @/lib/reading-dedupe ──
export async function findRecentDuplicateReading() {
  return null;
}

// ── @/lib/relationship/closed · passes ── (종료를 되돌렸을 때도 새지 않는지 본다)
export function relationshipClosedResponse() {
  return null;
}
export async function getActivePass() {
  return { id: "pass" };
}
export async function getTodayThreadTurns() {
  return 0;
}
export async function getTodayExtendCount() {
  return 0;
}

// ── @/lib/logger ──
export async function logError() {}
export async function logWarn() {}
export async function logInfo() {}
export function ctxFromRequest() {
  return {};
}

// ── @/lib/meta-capi ──
export function capiSignalsFromRequest() {
  return {};
}
export async function sendCapiEvent() {}

// ── @/lib/claude ──
export async function generateOnce(system: unknown, messages: unknown): Promise<string> {
  state.prompts.push(JSON.stringify([system, messages]));
  return "테스트가 일부러 돌려주는, 궁합 리포트로 읽을 수 없는 답이다.";
}
function unused(): never {
  throw new Error("compat-self-name.fakes: 이 테스트가 쓰지 않는 AI 함수");
}
export const buildRelationshipSystemMessage = unused;
export const streamChat = unused;
export const summarizeOlder = unused;
export const computeTurnSignals = unused;
export const formatDrawnCardsBlock = unused;
export const VERDICT_INTHREAD_TURN_CAP = 0;
