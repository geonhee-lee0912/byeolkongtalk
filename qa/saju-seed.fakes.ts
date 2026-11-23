// saju-seed.test.ts 전용 가짜 — @/lib/supabase 자리에 들어간다(테스트의 resolve 훅).

export const state = { inserts: [] as { table: string; row: Record<string, unknown> }[], fail: false };

export function getServiceSupabase() {
  return {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (state.fail) return { data: null, error: { message: "boom" } };
            state.inserts.push({ table, row });
            return { data: { id: "seeded-1" }, error: null };
          },
        }),
      }),
    }),
  };
}
