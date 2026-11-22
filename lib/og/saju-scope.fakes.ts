// saju-scope.test.ts 전용 가짜 — @/lib/supabase 자리에 들어간다(테스트의 resolve 훅).

type Row = Record<string, unknown>;

export const state = { reading: null as Row | null, messages: [] as Row[] };

export function getServiceSupabase() {
  return {
    from(table: string) {
      let columns: string[] = [];
      const q = {
        select(c: string) {
          columns = c.split(",").map((s) => s.trim());
          return q;
        },
        eq: () => q,
        // 라우트가 select 에 적은 칸만 돌려준다 — 조건에 쓸 칸을 안 읽어 오면 테스트가 깨지게
        maybeSingle: async () => ({
          data: state.reading && Object.fromEntries(columns.map((c) => [c, state.reading![c]])),
          error: null,
        }),
        order: async () => ({ data: table === "messages" ? state.messages : [], error: null }),
      };
      return q;
    },
  };
}
