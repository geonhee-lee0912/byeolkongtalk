// stars-clawback.test.ts 전용 가짜 — lib/stars.ts 가 import 하는 ./supabase 자리에 들어간다(테스트의 resolve 훅).
// rpc 가 받은 호출은 calls 에 남고, 돌려줄 응답은 테스트가 next 로 정한다.

export const calls: { fn: string; args: Record<string, unknown> }[] = [];
export const next: { value: { data: unknown; error: unknown } } = { value: { data: null, error: null } };

export function getServiceSupabase() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return next.value;
    },
  };
}
