// closed.test.ts 전용 가짜 — 우리 사이 쓰기 라우트가 import 하는 @/lib/supabase · @/lib/session 자리에
// 이 모듈 하나가 들어간다(테스트의 resolve 훅). 종료된 라우트는 세션·DB 를 한 번도 건드리면 안 되므로
// 무엇이든 불리면 calls 에 남기고 던진다(별 차감 lib/stars·이용권 lib/relationship/passes 도 전부 getServiceSupabase 를 거친다).

export const calls: string[] = [];

function touched(name: string): never {
  calls.push(name);
  throw new Error(`종료된 라우트가 ${name} 를 불렀다`);
}

// ── @/lib/session ──
export async function getSession() {
  return touched("getSession");
}
export async function requireSessionId() {
  return touched("requireSessionId");
}
export async function setUserCookie() {
  return touched("setUserCookie");
}
export function clearUserCookie() {
  return touched("clearUserCookie");
}
export function clearAnonCookie() {
  return touched("clearAnonCookie");
}
export function clearAllCookies() {
  return touched("clearAllCookies");
}

// ── @/lib/supabase ──
export function getSupabase() {
  return touched("getSupabase");
}
export function getServiceSupabase() {
  return touched("getServiceSupabase");
}
