// closed.test.ts 전용 가짜 — @/lib/session · @/lib/supabase · @/lib/stars · @/lib/logger 자리에 들어간다(테스트의 resolve 훅).
// 부모 조회만 답하고, 그 밖에 무엇을 불렀는지는 calls 에 남는다.

export const state = {
  calls: [] as string[],
  parent: null as Record<string, unknown> | null,
};

export function reset(parent: Record<string, unknown> | null = null): void {
  state.calls = [];
  state.parent = parent;
}

// ── @/lib/session ──
export async function getSession() {
  state.calls.push("getSession");
  return { userId: "u1", anonId: null };
}

// ── @/lib/supabase ──
export function getServiceSupabase() {
  return {
    from(table: string) {
      const q = {
        select: () => {
          state.calls.push(`select:${table}`);
          return q;
        },
        insert: () => {
          state.calls.push(`insert:${table}`);
          return q;
        },
        eq: () => q,
        order: () => q,
        maybeSingle: async () => ({ data: table === "readings" ? state.parent : null, error: null }),
        single: async () => ({ data: null, error: null }),
        // 부모의 assistant 메시지 — 비어 있다(마무리 안 된 부모)
        then: (resolve: (v: { data: never[]; error: null }) => void) => resolve({ data: [], error: null }),
      };
      return q;
    },
  };
}

// ── @/lib/stars ──
export async function getStarBalance() {
  state.calls.push("getStarBalance");
  return 1000;
}
export async function spendStars() {
  state.calls.push("spendStars");
  return { success: true };
}

// ── @/lib/logger ──
export async function logError() {}
export async function logWarn() {}
export async function logInfo() {}
export function ctxFromRequest(_req: unknown, ctx: unknown) {
  return ctx;
}
