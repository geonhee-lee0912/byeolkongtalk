// app-token-routes.test.ts 전용 가짜 — 앱 토큰 라우트(app/api/auth/app/{refresh,handoff-code,logout,handoff,reset}/route.ts)와
// 공용 모듈(lib/auth/app-route.ts)이 import 하는 @/lib/logger · ./app-session-store 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// 저장소 자리는 메모리 표다 — 조건부 갱신(claim)이 원자적이라는 실 저장소의 계약을 그대로 흉내 낸다(app-session.test.ts 의 memoryStore 와 같은 규칙).
// 토큰 교체·재사용 감지(app-session.ts)·서명(app-token.ts)·속도 제한(lib/ratelimit.ts)·쿠키(lib/session.ts)는 진짜가 돈다.
import type { AppSessionStore, Platform } from "./app-session.ts";

type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> };

export type LoggedEntry = {
  level: "error" | "warn";
  message: string;
  route: string | undefined;
  userId: string | null | undefined;
  extra: Record<string, unknown>;
};

export type RefreshRow = {
  user_id: string;
  family_id: string;
  token_hash: string;
  platform: Platform | null;
  expires_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
};
export type HandoffRow = { code_hash: string; user_id: string; is_new_user: boolean; expires_at: string; used_at: string | null };
export type StoreMethod = keyof AppSessionStore;

type State = {
  refresh: RefreshRow[];
  handoff: HandoffRow[];
  /** 저장소를 부른 순서(메서드 이름) — '막혔으면 DB 에 묻지도 않는다'를 본다 */
  calls: StoreMethod[];
  /** 이 메서드를 부르면 던진다(DB 순간 오류 자리) */
  failOn: StoreMethod | null;
  logs: LoggedEntry[];
};

function fresh(): State {
  return { refresh: [], handoff: [], calls: [], failOn: null, logs: [] };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

// ── @/lib/logger ──
export async function logError(err: unknown, ctx: LogCtx = {}) {
  state.logs.push({
    level: "error",
    message: err instanceof Error ? err.message : String(err),
    route: ctx.route,
    userId: ctx.userId,
    extra: ctx.extra ?? {},
  });
}
export async function logWarn(message: string, ctx: LogCtx = {}) {
  state.logs.push({ level: "warn", message, route: ctx.route, userId: ctx.userId, extra: ctx.extra ?? {} });
}
export function ctxFromRequest(_req: Request, base: LogCtx = {}): LogCtx {
  return base;
}

// ── ./app-session-store (lib/auth/app-session-store.ts) ──
function enter(method: StoreMethod): void {
  state.calls.push(method);
  if (state.failOn === method) throw new Error(`db blip: ${method}`);
}

export function supabaseAppSessionStore(): AppSessionStore {
  return {
    async insertRefresh(row) {
      enter("insertRefresh");
      state.refresh.push({ ...row, rotated_at: null, revoked_at: null });
    },
    async claimRefresh(tokenHash, nowIso) {
      enter("claimRefresh");
      const r = state.refresh.find((x) => x.token_hash === tokenHash && !x.rotated_at && !x.revoked_at && x.expires_at > nowIso);
      if (!r) return null;
      r.rotated_at = nowIso;
      return { user_id: r.user_id, family_id: r.family_id, platform: r.platform };
    },
    async releaseRefresh(tokenHash, rotatedAtIso) {
      enter("releaseRefresh");
      const r = state.refresh.find((x) => x.token_hash === tokenHash && x.rotated_at === rotatedAtIso);
      if (r) r.rotated_at = null;
    },
    async findRefresh(tokenHash) {
      enter("findRefresh");
      const r = state.refresh.find((x) => x.token_hash === tokenHash);
      return r ? { family_id: r.family_id, rotated_at: r.rotated_at, revoked_at: r.revoked_at } : null;
    },
    async revokeFamily(familyId, nowIso) {
      enter("revokeFamily");
      for (const r of state.refresh) if (r.family_id === familyId && !r.revoked_at) r.revoked_at = nowIso;
    },
    async insertHandoff(row) {
      enter("insertHandoff");
      state.handoff.push({ ...row, used_at: null });
    },
    async claimHandoff(codeHash, nowIso) {
      enter("claimHandoff");
      const c = state.handoff.find((x) => x.code_hash === codeHash && !x.used_at && x.expires_at > nowIso);
      if (!c) return null;
      c.used_at = nowIso;
      return { user_id: c.user_id, is_new_user: c.is_new_user };
    },
  };
}
