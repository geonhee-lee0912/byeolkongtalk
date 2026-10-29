// sync.test.ts 전용 가짜 — lib/ads/sync.ts 가 import 하는 @/lib/supabase · @/lib/logger · ./meta-insights 자리에
// 이 모듈 하나가 들어간다(테스트의 resolve 훅 — 이 파일에서 나가는 import 는 바꾸지 않는다).
// meta-insights 의 순수 변환(datesInRange·toAdSpendRows…)과 MetaTransientError 는 진짜를 다시 내보내고,
// Meta 를 실제로 부르는 fetchInsights·fetchActiveAdNames 만 state 가 정한 대로 돌려준다.
export * from "./meta-insights.ts";
import type { InsightRow } from "./meta-insights.ts";

type Row = Record<string, unknown>;

export type LoggedEntry = { level: "error" | "warn"; message: string; extra: Row | undefined };

type State = {
  insights: () => Promise<InsightRow[]>;
  activeAdNames: () => Promise<string[]>;
  runInserts: Row[];
  runUpdates: { id: unknown; row: Row }[];
  rpcs: { fn: string; args: Row }[];
  logs: LoggedEntry[];
};

function fresh(): State {
  return {
    insights: async () => [],
    activeAdNames: async () => [],
    runInserts: [],
    runUpdates: [],
    rpcs: [],
    logs: [],
  };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

// ── ./meta-insights (Meta 호출 두 개만) ──
export async function fetchInsights(): Promise<InsightRow[]> {
  return state.insights();
}
export async function fetchActiveAdNames(): Promise<string[]> {
  return state.activeAdNames();
}

// ── @/lib/logger ──
export async function logError(err: unknown, ctx: { extra?: Row } = {}): Promise<void> {
  state.logs.push({ level: "error", message: err instanceof Error ? err.message : String(err), extra: ctx.extra });
}
export async function logWarn(message: string, ctx: { extra?: Row } = {}): Promise<void> {
  state.logs.push({ level: "warn", message, extra: ctx.extra });
}

// ── @/lib/supabase ──
const RUN_ID = 41;
export function getServiceSupabase() {
  return {
    from(table: string) {
      if (table !== "ad_sync_runs") throw new Error(`sync.fakes: 모르는 표 ${table}`);
      return {
        insert(row: Row) {
          state.runInserts.push(row);
          return { select: () => ({ single: async () => ({ data: { id: RUN_ID }, error: null }) }) };
        },
        update(row: Row) {
          return {
            eq: async (_col: string, id: unknown) => {
              state.runUpdates.push({ id, row });
              return { error: null };
            },
          };
        },
      };
    },
    async rpc(fn: string, args: Row) {
      state.rpcs.push({ fn, args });
      const rows = args.p_rows as unknown[];
      return { data: rows.length, error: null };
    },
  };
}
