// survey-route.test.ts 전용 가짜 — @/lib/supabase · session · stars · logger 자리에 들어간다(테스트의 resolve 훅).

export const USER = "00000000-0000-4000-8000-000000000001";
export const state = {
  row: false, // survey_responses 에 이 회원 행이 있나(1년 뒤엔 파기로 없어진다)
  rewarded: false, // star_transactions 에 survey:<회원> 보상 원장이 있나
  ledgerError: false,
  inserts: 0,
  charges: 0,
  logs: 0,
};

export function getServiceSupabase() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return q;
        },
        limit: () => q,
        async maybeSingle() {
          if (table === "survey_responses") return { data: state.row ? { id: 1 } : null, error: null };
          if (table === "star_transactions") {
            if (state.ledgerError) return { data: null, error: { message: "boom", code: "XX000" } };
            const mine = filters.payment_id === `survey:${USER}`;
            return { data: state.rewarded && mine ? { id: "t" } : null, error: null };
          }
          throw new Error("survey-route.fakes: 예상 밖 조회 — " + table);
        },
        async insert() {
          if (table !== "survey_responses") throw new Error("survey-route.fakes: 예상 밖 저장 — " + table);
          if (state.row) return { error: { code: "23505", message: "dup" } };
          state.inserts++;
          return { error: null };
        },
      };
      return q;
    },
  };
}

export async function getSession() {
  return { userId: USER, anonymousId: "anon", isAuthenticated: true };
}
export async function chargeStars() {
  state.charges++;
  return { success: true, balance: 10 };
}
export async function logError() {
  state.logs++;
}
