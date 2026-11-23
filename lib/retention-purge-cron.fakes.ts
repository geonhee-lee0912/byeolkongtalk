// retention-purge-cron.test.ts 전용 가짜 — @/lib/supabase · @/lib/logger 자리에 들어간다(테스트의 resolve 훅).

export const state = {
  calls: [] as { fn: string; args: unknown }[],
  logs: [] as { level: "info" | "warn" | "error"; what: unknown; ctx: unknown }[],
  result: { data: null, error: null } as { data: unknown; error: { message: string; code?: string } | null },
};

export function reset(result: typeof state.result): void {
  state.calls = [];
  state.logs = [];
  state.result = result;
}

export function getServiceSupabase() {
  return {
    rpc: async (fn: string, args: unknown) => {
      state.calls.push({ fn, args });
      return state.result;
    },
  };
}

export async function logError(what: unknown, ctx: unknown) {
  state.logs.push({ level: "error", what, ctx });
}
export async function logWarn(what: unknown, ctx: unknown) {
  state.logs.push({ level: "warn", what, ctx });
}
export async function logInfo(what: unknown, ctx: unknown) {
  state.logs.push({ level: "info", what, ctx });
}
