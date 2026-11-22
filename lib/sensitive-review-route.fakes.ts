// sensitive-review-route.test.ts 전용 가짜 — @/lib/supabase · @/lib/admin-actions 자리에 들어간다(테스트의 resolve 훅).

export const state = {
  readingCreatedAt: null as string | null,
  readingError: false,
  otherAlerts: 0,
  readingId: "r1" as string | null,
  readingPatches: [] as unknown[],
};

export function getServiceSupabase() {
  return {
    from(table: string) {
      let op = "select";
      let head = false;
      let patch: unknown;
      const result = () => {
        if (table === "sensitive_alerts") {
          if (op === "update") return { data: { id: "a1", reading_id: state.readingId }, error: null };
          if (head) return { count: state.otherAlerts, error: null };
        }
        if (table === "readings") {
          if (op === "update") {
            state.readingPatches.push(patch);
            return { data: null, error: null };
          }
          if (state.readingError) return { data: null, error: { message: "boom" } };
          return { data: state.readingCreatedAt ? { created_at: state.readingCreatedAt } : null, error: null };
        }
        throw new Error("sensitive-review-route.fakes: 예상 밖 요청 — " + table);
      };
      const q = {
        update(p: unknown) {
          op = "update";
          patch = p;
          return q;
        },
        select(_columns: string, opts?: { head?: boolean }) {
          head = !!opts?.head;
          return q;
        },
        eq: () => q,
        neq: () => q,
        or: () => q,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: <T>(resolve: (v: ReturnType<typeof result>) => T) => Promise.resolve(result()).then(resolve),
      };
      return q;
    },
  };
}

export async function requireAdminWrite() {
  return { userId: "admin" };
}
export async function logAdminAction() {}
