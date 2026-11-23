// grant.test.ts 전용 가짜 — lib/payment/grant.ts 가 import 하는 @/lib/supabase · @/lib/stars · @/lib/logger 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// 로그인 수단 조회(lib/auth/user-identity.ts)·해시·패키지 상수는 진짜가 돈다 — DB 자리만 아래 메모리 표다.
// payments 는 진짜처럼 pg_tid 유니크를 지킨다(두 번째 INSERT → 23505) — 동시 지급 경합을 그대로 재현하려고.
// 라우트·지급 함수가 여기 없는 표·동작을 쓰기 시작하면 throw 한다 — 테스트를 거기부터 늘리라는 신호.

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null };
type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> };

export type LoggedEntry = { level: "error" | "warn"; message: string; extra: Record<string, unknown> };

/** QA봇 — 공개 저장소에 써도 되는 유일한 회원 id */
export const USER_ID = "11111111-1111-4111-8111-111111111111";

type State = {
  identities: Row[];
  /** payments 표 — id 는 INSERT 순서대로 pay-1, pay-2 … */
  payments: Row[];
  /** 다음 payments INSERT 를 이 오류로 실패시킨다(한 번 쓰고 비워짐) */
  insertError: DbError | null;
  /** payments UPDATE 오류 */
  updateError: DbError | null;
  /** 유니크 위반(23505)으로 거절된 INSERT 횟수 */
  conflicts: number;
  /** bonus_claims 원장 */
  ledger: { kakao_id_hash: string; bonus_type: string }[];
  balance: number;
  /** chargeStars 가 실패를 돌려주는 source 들 */
  failSources: string[];
  /** chargeStars 호출 전부 — idempotent 는 같은 payment_id 로 이미 충전돼 아무것도 안 한 호출(진짜 charge_stars 의 멱등 경로) */
  charges: { userId: string; amount: number; paymentId: string; source: string; idempotent?: boolean; failed?: boolean }[];
  logs: LoggedEntry[];
};

function fresh(): State {
  return {
    identities: [{ provider: "kakao", provider_user_id: "4123456789", apple_client_id: null, apple_refresh_token_enc: null }],
    payments: [],
    insertError: null,
    updateError: null,
    conflicts: 0,
    ledger: [],
    balance: 15,
    failSources: [],
    charges: [],
    logs: [],
  };
}

export const state: State = fresh();

const seenPaymentIds = new Set<string>();

export function reset(): void {
  Object.assign(state, fresh());
  seenPaymentIds.clear();
}

// ── @/lib/supabase ──
function project(row: Row | null, columns: string): Row | null {
  if (!row || columns.trim() === "*") return row;
  const out: Row = {};
  for (const c of columns.split(",").map((s) => s.trim())) if (c in row) out[c] = row[c];
  return out;
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private columns = "*";
  private row: Row = {};
  private readonly filters: [string, unknown][] = [];

  constructor(private readonly table: string) {}

  select(columns = "*"): this {
    this.columns = columns; // insert(...).select("id") 는 op 를 바꾸지 않는다
    return this;
  }
  insert(row: Row): this {
    this.op = "insert";
    this.row = row;
    return this;
  }
  update(row: Row): this {
    this.op = "update";
    this.row = row;
    return this;
  }
  upsert(row: Row, _opts?: unknown): this {
    this.op = "upsert";
    this.row = row;
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

  private matches(row: Row): boolean {
    return this.filters.every(([c, v]) => row[c] === v);
  }

  private run(): Result {
    const { table, op } = this;
    if (op === "insert") {
      if (table !== "payments") throw new Error(`grant.fakes: 예상 밖 insert — ${table}`);
      if (state.insertError) {
        const error = state.insertError;
        state.insertError = null;
        return { data: null, error };
      }
      if (state.payments.some((p) => p.pg_tid === this.row.pg_tid)) {
        state.conflicts += 1;
        return { data: null, error: { message: 'duplicate key value violates unique constraint "payments_pg_tid_key"', code: "23505" } };
      }
      const row = { id: `pay-${state.payments.length + 1}`, bonus_stars: 0, ...this.row };
      state.payments.push(row);
      return { data: project(row, this.columns), error: null };
    }
    if (op === "update") {
      if (table !== "payments") throw new Error(`grant.fakes: 예상 밖 update — ${table}`);
      if (state.updateError) return { data: null, error: state.updateError };
      for (const p of state.payments) if (this.matches(p)) Object.assign(p, this.row);
      return { data: null, error: null };
    }
    if (op === "upsert") {
      if (table !== "bonus_claims") throw new Error(`grant.fakes: 예상 밖 upsert — ${table}`);
      const { kakao_id_hash, bonus_type } = this.row as { kakao_id_hash: string; bonus_type: string };
      // ignoreDuplicates — 이미 있으면 새 행이 없으니 빈 배열
      if (state.ledger.some((c) => c.kakao_id_hash === kakao_id_hash && c.bonus_type === bonus_type)) {
        return { data: [], error: null };
      }
      state.ledger.push({ kakao_id_hash, bonus_type });
      return { data: [project({ kakao_id_hash, bonus_type }, this.columns)], error: null };
    }
    switch (table) {
      case "payments":
        return { data: project(state.payments.find((p) => this.matches(p)) ?? null, this.columns), error: null };
      case "user_identities":
        return { data: state.identities.map((r) => project(r, this.columns)), error: null };
      case "users":
        return { data: null, error: null };
      case "star_balances":
        return { data: { balance: state.balance }, error: null };
      default:
        throw new Error(`grant.fakes: 예상 밖 조회 — ${table}`);
    }
  }
}

export function getServiceSupabase() {
  return { from: (table: string) => new FakeQuery(table) };
}

// ── @/lib/stars ── 같은 paymentId 는 멱등(진짜 charge_stars 와 같다)
export async function chargeStars(
  userId: string,
  amount: number,
  paymentId: string,
  source: string = "pg",
): Promise<{ success: boolean; balance: number; idempotent?: boolean }> {
  const entry: State["charges"][number] = { userId, amount, paymentId, source };
  state.charges.push(entry);
  if (state.failSources.includes(source)) {
    entry.failed = true;
    return { success: false, balance: 0 };
  }
  if (seenPaymentIds.has(paymentId)) {
    entry.idempotent = true;
    return { success: true, balance: state.balance, idempotent: true };
  }
  seenPaymentIds.add(paymentId);
  state.balance += amount;
  return { success: true, balance: state.balance, idempotent: false };
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
