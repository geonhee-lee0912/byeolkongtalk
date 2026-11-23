// iap-refund.test.ts 전용 가짜 — 환불 회수(lib/payment/iap/refund.ts)와 환불 알림 라우트 2개가 import 하는
// @/lib/supabase · @/lib/stars · @/lib/logger · @/lib/payment/iap/apple · @/lib/payment/iap/google 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// 회수 함수(refund.ts)·RTDN 해석(google-rtdn.ts)·설정 확인(verify.ts)은 진짜가 돈다 — 라우트 테스트도 진짜 회수 함수를 가짜 DB 위에서 돌린다.
// 여기 없는 표·동작을 쓰기 시작하면 throw 한다 — 테스트를 거기부터 늘리라는 신호.
import type { AppleNotification } from "./iap/apple.ts";

/** QA봇 — 공개 저장소에 써도 되는 유일한 회원 id */
export const USER_ID = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null };
type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> };

export type LoggedEntry = { level: "error" | "warn" | "info"; message: string; route: string | undefined; userId: unknown; extra: Record<string, unknown> };

type State = {
  payments: Row[];
  /** 결제 별 충전 거래(star_transactions type 'charge')가 있는 결제 id — 진짜 charge_stars 가 성공했을 때만 생기는 행 자리 */
  chargeTxs: string[];
  /** pg_tid 로 찾은 순서 */
  lookups: string[];
  lookupError: DbError | null;
  updateError: DbError | null;
  /** payments UPDATE 에 실린 값 전부 */
  updates: Row[];
  /** 회원 잔액 — 진짜 clawback_stars 처럼 0 아래로 내려가지 않는다 */
  balance: number;
  /** 이미 거둔 회수(payment_id → 거둔 양) — 진짜 RPC 의 'refund' 거래 행 자리. 멱등 기준 */
  clawed: Map<string, number>;
  clawbackFails: boolean;
  clawbacks: { userId: string; amount: number; paymentId: string }[];
  /** 애플 알림 검증 결과 — Error 면 throw(인증서 폐기 확인 실패·설정 오류 자리) */
  apple: AppleNotification | Error;
  appleCalls: string[];
  /** 구글 푸시 인증 결과 — Error 면 throw(설정 없음 자리) */
  googleAuth: boolean | Error;
  googleAuthCalls: (string | null)[];
  logs: LoggedEntry[];
};

function fresh(): State {
  return {
    payments: [],
    chargeTxs: [],
    lookups: [],
    lookupError: null,
    updateError: null,
    updates: [],
    balance: 20,
    clawed: new Map(),
    clawbackFails: false,
    clawbacks: [],
    apple: { kind: "ignored", notificationType: "TEST" },
    appleCalls: [],
    googleAuth: true,
    googleAuthCalls: [],
    logs: [],
  };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

/** 앱 결제 한 건 — 결제 별 10 + 첫충전 보너스 2. charged:false 면 결제 별 충전 거래가 없는 결제(charge_failed 로 멈춘 결제) */
export function seedPayment(over: Row = {}, { charged = true }: { charged?: boolean } = {}): Row {
  const row: Row = {
    id: `pay-${state.payments.length + 1}`,
    user_id: USER_ID,
    pg_provider: "apple",
    pg_tid: "apple:2000000000000001",
    stars_given: 10,
    bonus_stars: 2,
    status: "completed",
    refunded_at: null,
    stars_clawed_back: null,
    clawback_shortfall: null,
    ...over,
  };
  state.payments.push(row);
  if (charged) state.chargeTxs.push(row.id as string);
  return row;
}

// ── @/lib/supabase ──
function project(row: Row | null, columns: string): Row | null {
  if (!row || columns.trim() === "*") return row;
  const out: Row = {};
  for (const c of columns.split(",").map((s) => s.trim())) {
    if (!(c in row)) throw new Error(`iap-refund.fakes: payments 에 없는 칸 — ${c}`);
    out[c] = row[c];
  }
  return out;
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "update" = "select";
  private columns = "*";
  private row: Row = {};
  private readonly filters: [string, unknown][] = [];

  constructor(private readonly table: string) {
    if (table !== "payments" && table !== "star_transactions") throw new Error(`iap-refund.fakes: 예상 밖 표 — ${table}`);
  }

  select(columns = "*"): this {
    this.columns = columns;
    return this;
  }
  update(row: Row): this {
    this.op = "update";
    this.row = row;
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
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

  private matches(row: Row): boolean {
    return this.filters.every(([c, v]) => row[c] === v);
  }

  private run(): Result {
    if (this.table === "star_transactions") {
      // 읽기만 — 결제 별 충전 거래가 있는지(payment_id + type 'charge')
      if (this.op !== "select") throw new Error("iap-refund.fakes: star_transactions 는 읽기만");
      const paymentId = this.filters.find(([c]) => c === "payment_id")?.[1];
      const type = this.filters.find(([c]) => c === "type")?.[1];
      const hit = type === "charge" && typeof paymentId === "string" && state.chargeTxs.includes(paymentId);
      return { data: hit ? { id: `tx-${paymentId}` } : null, error: null };
    }
    if (this.op === "update") {
      if (state.updateError) return { data: null, error: state.updateError };
      state.updates.push({ ...this.row });
      for (const p of state.payments) if (this.matches(p)) Object.assign(p, this.row);
      return { data: null, error: null };
    }
    const tid = this.filters.find(([c]) => c === "pg_tid")?.[1];
    if (typeof tid === "string") state.lookups.push(tid);
    if (state.lookupError) return { data: null, error: state.lookupError };
    return { data: project(state.payments.find((p) => this.matches(p)) ?? null, this.columns), error: null };
  }
}

export function getServiceSupabase() {
  return { from: (table: string) => new FakeQuery(table) };
}

// ── @/lib/stars ── 진짜 clawback_stars 처럼: 남은 만큼만(0 아래로 안 감) · 같은 payment_id 는 멱등 · 'clawback:' 접두가 아니면 거절
export async function clawbackStars(
  userId: string,
  amount: number,
  paymentId: string,
): Promise<{ success: boolean; clawed: number; shortfall: number; balance: number; idempotent: boolean }> {
  state.clawbacks.push({ userId, amount, paymentId });
  if (state.clawbackFails || !paymentId.startsWith("clawback:") || amount <= 0) {
    return { success: false, clawed: 0, shortfall: 0, balance: 0, idempotent: false };
  }
  const prior = state.clawed.get(paymentId);
  if (prior !== undefined) {
    return { success: true, clawed: prior, shortfall: Math.max(amount - prior, 0), balance: state.balance, idempotent: true };
  }
  const clawed = Math.min(state.balance, amount);
  state.balance -= clawed;
  state.clawed.set(paymentId, clawed);
  return { success: true, clawed, shortfall: amount - clawed, balance: state.balance, idempotent: false };
}

// ── @/lib/payment/iap/apple ──
export async function verifyAppleRefundNotification(signedPayload: string): Promise<AppleNotification> {
  state.appleCalls.push(signedPayload);
  if (state.apple instanceof Error) throw state.apple;
  return state.apple;
}

// ── @/lib/payment/iap/google ──
export async function verifyGooglePushAuth(authorization: string | null): Promise<boolean> {
  state.googleAuthCalls.push(authorization);
  if (state.googleAuth instanceof Error) throw state.googleAuth;
  return state.googleAuth;
}

// ── @/lib/logger ──
function record(level: LoggedEntry["level"], message: string, ctx: LogCtx = {}): void {
  state.logs.push({ level, message, route: ctx.route, userId: ctx.userId, extra: ctx.extra ?? {} });
}
export async function logError(err: unknown, ctx?: LogCtx): Promise<void> {
  record("error", err instanceof Error ? err.message : String(err), ctx);
}
export async function logWarn(message: string, ctx?: LogCtx): Promise<void> {
  record("warn", message, ctx);
}
export async function logInfo(message: string, ctx?: LogCtx): Promise<void> {
  record("info", message, ctx);
}
export function ctxFromRequest(_req: Request, base: LogCtx = {}): LogCtx {
  return base;
}
