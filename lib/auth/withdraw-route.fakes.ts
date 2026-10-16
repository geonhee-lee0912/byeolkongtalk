// withdraw-route.test.ts 전용 가짜 — 회원 탈퇴 라우트(app/api/auth/withdraw/route.ts)가 import 하는
// @/lib/supabase · @/lib/session · @/lib/kakao · @/lib/logger · @/lib/auth/apple 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// 로그인 수단 조회(lib/auth/user-identity.ts — users.kakao_id 보충 포함)·해시·토큰 복호화는 진짜가 돈다 — DB 자리만 아래 메모리 표다.
// 라우트가 부른 순서는 state.calls 에 남는다: "getSession" · "<select|insert|delete>:<표>" · "unlinkKakao:<회원번호>" · "revokeApple" · "clearAllCookies".
// 조회는 select 에 적힌 칸만 돌려준다(칸을 빠뜨리면 실제 DB 처럼 그 값이 없다). 라우트가 여기 없는 표·동작을 쓰기 시작하면 throw 한다 — 테스트를 거기부터 늘리라는 신호.
import type { NextResponse } from "next/server";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type Filter = [column: string, value: unknown];
type Result = { data: unknown; error: DbError | null };
type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> };

export type LoggedEntry = {
  level: "error" | "warn" | "info";
  message: string;
  route: string | undefined;
  userId: string | null | undefined;
  extra: Record<string, unknown>;
};

export const USER_ID = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";

type State = {
  sessionUserId: string | null;
  /** user_identities 조회 결과(null = data 없음)·오류 */
  identities: Row[] | null;
  identitiesError: DbError | null;
  /** users 보충 조회 결과(null = 회원 행 없음)·오류 */
  userRow: Row | null;
  userError: DbError | null;
  /** user_acquisition 유입 스냅샷(null = 없음) */
  acquisition: Row | null;
  withdrawalInsertError: DbError | null;
  userDeleteError: DbError | null;
  kakaoUnlink: { ok: boolean; alreadyUnlinked: boolean; status?: number; code?: number };
  appleRevokeError: Error | null;
  calls: string[];
  selects: { table: string; filters: Filter[] }[];
  inserts: { table: string; row: Row }[];
  deletes: { table: string; filters: Filter[] }[];
  appleRevokes: { refreshToken: string; clientId: string }[];
  logs: LoggedEntry[];
};

function fresh(): State {
  return {
    sessionUserId: USER_ID,
    identities: [],
    identitiesError: null,
    userRow: null,
    userError: null,
    acquisition: null,
    withdrawalInsertError: null,
    userDeleteError: null,
    kakaoUnlink: { ok: true, alreadyUnlinked: false },
    appleRevokeError: null,
    calls: [],
    selects: [],
    inserts: [],
    deletes: [],
    appleRevokes: [],
    logs: [],
  };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

// ── @/lib/supabase ──
const SELECTABLE = new Set(["user_identities", "users", "user_acquisition"]);
const INSERTABLE = new Set(["account_withdrawals"]);
const DELETABLE = new Set(["star_transactions", "star_balances", "users"]);

function project(row: Row | null, columns: string): Row | null {
  if (!row || columns.trim() === "*") return row;
  const out: Row = {};
  for (const c of columns.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "delete" = "select";
  private columns = "*";
  private row: Row = {};
  private readonly filters: Filter[] = [];

  constructor(private readonly table: string) {}

  select(columns = "*"): this {
    this.columns = columns;
    return this;
  }
  insert(row: Row): this {
    this.op = "insert";
    this.row = row;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }
  order(_column: string, _opts?: { ascending?: boolean }): this {
    return this;
  }
  maybeSingle(): Promise<Result> {
    return Promise.resolve().then(() => this.run());
  }
  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onFulfilled, onRejected);
  }

  private run(): Result {
    const { table, op } = this;
    state.calls.push(`${op}:${table}`);
    if (op === "insert") {
      if (!INSERTABLE.has(table)) throw new Error(`withdraw-route.fakes: 예상 밖 insert — ${table}`);
      state.inserts.push({ table, row: this.row });
      return { data: null, error: state.withdrawalInsertError };
    }
    if (op === "delete") {
      if (!DELETABLE.has(table)) throw new Error(`withdraw-route.fakes: 예상 밖 delete — ${table}`);
      state.deletes.push({ table, filters: [...this.filters] });
      return { data: null, error: table === "users" ? state.userDeleteError : null };
    }
    if (!SELECTABLE.has(table)) throw new Error(`withdraw-route.fakes: 예상 밖 조회 — ${table}`);
    state.selects.push({ table, filters: [...this.filters] });
    if (table === "user_identities") {
      return {
        data: state.identities?.map((r) => project(r, this.columns)) ?? null,
        error: state.identitiesError,
      };
    }
    if (table === "users") return { data: project(state.userRow, this.columns), error: state.userError };
    return { data: project(state.acquisition, this.columns), error: null };
  }
}

export function getServiceSupabase() {
  return { from: (table: string) => new FakeQuery(table) };
}

// ── @/lib/session ──
export async function getSession() {
  state.calls.push("getSession");
  const userId = state.sessionUserId;
  return { userId, anonymousId: null, isAuthenticated: !!userId };
}
export function clearAllCookies(_res: NextResponse): void {
  state.calls.push("clearAllCookies");
}

// ── @/lib/kakao ──
export async function unlinkKakao(kakaoId: number | string) {
  state.calls.push(`unlinkKakao:${String(kakaoId)}`);
  return state.kakaoUnlink;
}

// ── @/lib/auth/apple ──
export async function revokeAppleToken(refreshToken: string, clientId: string): Promise<void> {
  state.calls.push("revokeApple");
  state.appleRevokes.push({ refreshToken, clientId });
  if (state.appleRevokeError) throw state.appleRevokeError;
}

// ── @/lib/logger ──
function record(level: LoggedEntry["level"], message: string, ctx: LogCtx = {}): void {
  state.logs.push({ level, message, route: ctx.route, userId: ctx.userId, extra: ctx.extra ?? {} });
}
export async function logError(err: unknown, ctx?: LogCtx): Promise<void> {
  record("error", err instanceof Error ? err.message : JSON.stringify(err), ctx);
}
export async function logWarn(message: string, ctx?: LogCtx): Promise<void> {
  record("warn", message, ctx);
}
export async function logInfo(message: string, ctx?: LogCtx): Promise<void> {
  record("info", message, ctx);
}
