// client-error-route.test.ts 전용 가짜 — 클라 에러 수집 라우트(app/api/log/error/route.ts)가 import 하는
// @/lib/supabase · @/lib/session 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅). 봇 판정(lib/analytics/pageview.ts)은 진짜가 돈다.
// 라우트가 insert 한 행은 state.inserts 에 그대로 남는다.

type Row = Record<string, unknown>;

type State = {
  sessionUserId: string | null;
  anonymousId: string | null;
  inserts: { table: string; row: Row }[];
};

function fresh(): State {
  return { sessionUserId: null, anonymousId: "anon-1", inserts: [] };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

// ── @/lib/session ──
export async function getSession() {
  return { userId: state.sessionUserId, anonymousId: state.anonymousId };
}

// ── @/lib/supabase ──
export function getServiceSupabase() {
  return {
    from(table: string) {
      return {
        async insert(row: Row) {
          state.inserts.push({ table, row });
          return { error: null };
        },
      };
    },
  };
}
