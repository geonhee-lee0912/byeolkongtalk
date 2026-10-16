// first-charge-bonus.test.ts 전용 가짜 — 결제 승인(app/api/payment/confirm/route.ts)·첫충전 자격 조회(app/api/stars/first-charge-status/route.ts)가
// import 하는 @/lib/supabase · @/lib/session · @/lib/logger · @/lib/toss · @/lib/stars · @/lib/meta-capi 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// 로그인 수단 조회(lib/auth/user-identity.ts — users.kakao_id 보충 포함)·해시·패키지 상수는 진짜가 돈다 — DB 자리만 아래 메모리 표다.
// 라우트가 부른 순서는 state.calls 에 남는다: "getSession" · "<select|insert|upsert>:<표>" · "confirmPayment" · "cancelPayment" · "chargeStars:<source>" · "capi:<이벤트>".
// 조회는 select 에 적힌 칸만 돌려준다. 라우트가 여기 없는 표·동작을 쓰기 시작하면 throw 한다 — 테스트를 거기부터 늘리라는 신호.

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type Filter = [column: string, value: unknown];
type Result = { data: unknown; error: DbError | null };
type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> };
type Charge = { success: boolean; balance: number; idempotent?: boolean };

export type LoggedEntry = { level: "error" | "warn"; message: string; extra: Record<string, unknown> };

export const USER_ID = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";
export const PAYMENT_ID = "9a8b7c6d-0000-4000-8000-000000000001";

type State = {
  sessionUserId: string | null;
  /** user_identities 조회 결과·오류 */
  identities: Row[];
  identitiesError: DbError | null;
  /** users 보충 조회 결과(null = 회원 행 없음)·오류 */
  userRow: Row | null;
  userError: DbError | null;
  /** 같은 paymentKey 로 이미 기록된 결제(null = 처음) */
  existingPayment: Row | null;
  /** bonus_claims 원장 — PK(kakao_id_hash, bonus_type) */
  ledger: { kakao_id_hash: string; bonus_type: string }[];
  /** 자격 조회의 원장 조회(select) 오류 */
  claimSelectError: DbError | null;
  pgCharge: Charge;
  bonusCharge: Charge;
  calls: string[];
  selects: { table: string; filters: Filter[] }[];
  upserts: { table: string; row: Row; opts: unknown }[];
  charges: { userId: string; amount: number; paymentId: string; source: string }[];
  logs: LoggedEntry[];
};

function fresh(): State {
  return {
    sessionUserId: USER_ID,
    identities: [],
    identitiesError: null,
    userRow: null,
    userError: null,
    existingPayment: null,
    ledger: [],
    claimSelectError: null,
    pgCharge: { success: true, balance: 85 },
    bonusCharge: { success: true, balance: 99, idempotent: false },
    calls: [],
    selects: [],
    upserts: [],
    charges: [],
    logs: [],
  };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

// ── @/lib/supabase ──
function project(row: Row | null, columns: string): Row | null {
  if (!row || columns.trim() === "*") return row;
  const out: Row = {};
  for (const c of columns.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" = "select";
  private columns = "*";
  private row: Row = {};
  private opts: unknown = undefined;
  private readonly filters: Filter[] = [];

  constructor(private readonly table: string) {}

  select(columns = "*"): this {
    this.columns = columns; // insert(...).select("id") · upsert(...).select(...) 는 op 를 바꾸지 않는다
    return this;
  }
  insert(row: Row): this {
    this.op = "insert";
    this.row = row;
    return this;
  }
  upsert(row: Row, opts?: unknown): this {
    this.op = "upsert";
    this.row = row;
    this.opts = opts;
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
  single(): Promise<Result> {
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
      if (table !== "payments") throw new Error(`first-charge-bonus.fakes: 예상 밖 insert — ${table}`);
      return { data: { id: PAYMENT_ID }, error: null };
    }
    if (op === "upsert") {
      if (table !== "bonus_claims") throw new Error(`first-charge-bonus.fakes: 예상 밖 upsert — ${table}`);
      state.upserts.push({ table, row: { ...this.row }, opts: this.opts });
      const { kakao_id_hash, bonus_type } = this.row as { kakao_id_hash: string; bonus_type: string };
      // ignoreDuplicates — 이미 있으면 새 행이 없으니 빈 배열
      if (state.ledger.some((c) => c.kakao_id_hash === kakao_id_hash && c.bonus_type === bonus_type)) {
        return { data: [], error: null };
      }
      state.ledger.push({ kakao_id_hash, bonus_type });
      return { data: [project({ kakao_id_hash, bonus_type }, this.columns)], error: null };
    }
    state.selects.push({ table, filters: [...this.filters] });
    const filter = (col: string) => this.filters.find(([c]) => c === col)?.[1];
    switch (table) {
      case "payments":
        return { data: project(state.existingPayment, this.columns), error: null };
      case "user_identities":
        return {
          data: state.identitiesError ? null : state.identities.map((r) => project(r, this.columns)),
          error: state.identitiesError,
        };
      case "users":
        return { data: project(state.userRow, this.columns), error: state.userError };
      case "bonus_claims": {
        if (state.claimSelectError) return { data: null, error: state.claimSelectError };
        const hit = state.ledger.find(
          (c) => c.kakao_id_hash === filter("kakao_id_hash") && c.bonus_type === filter("bonus_type"),
        );
        return { data: hit ? project({ ...hit }, this.columns) : null, error: null };
      }
      case "star_balances":
        return { data: { balance: state.pgCharge.balance }, error: null };
      default:
        throw new Error(`first-charge-bonus.fakes: 예상 밖 조회 — ${table}`);
    }
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

// ── @/lib/toss ──
export class TossPaymentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TossPaymentError";
  }
}
export async function confirmPayment(paymentKey: string, orderId: string, amount: number) {
  state.calls.push("confirmPayment");
  return { paymentKey, orderId, status: "DONE", totalAmount: amount, method: "카드", requestedAt: "", approvedAt: "" };
}
export async function cancelPayment(_paymentKey: string, _reason: string) {
  state.calls.push("cancelPayment");
  return {};
}

// ── @/lib/stars ──
export async function chargeStars(userId: string, amount: number, paymentId: string, source: string = "pg"): Promise<Charge> {
  state.calls.push(`chargeStars:${source}`);
  state.charges.push({ userId, amount, paymentId, source });
  return source === "pg" ? state.pgCharge : state.bonusCharge;
}

// ── @/lib/meta-capi ──
export function sendCapiEvent(params: { eventName: string }): void {
  state.calls.push(`capi:${params.eventName}`);
}
export function capiSignalsFromRequest(_request: Request) {
  return { fbp: null, fbc: null, clientIp: null, userAgent: null };
}

// ── @/lib/logger ──
function record(level: LoggedEntry["level"], message: string, ctx: LogCtx = {}): void {
  state.logs.push({ level, message, extra: ctx.extra ?? {} });
}
export async function logError(err: unknown, ctx?: LogCtx): Promise<void> {
  record("error", err instanceof Error ? err.message : JSON.stringify(err), ctx);
}
export async function logWarn(message: string, ctx?: LogCtx): Promise<void> {
  record("warn", message, ctx);
}
export function ctxFromRequest(_req: Request, base: LogCtx = {}): LogCtx {
  return base;
}
