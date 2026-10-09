// clarifier-race.test.ts 전용 가짜 — 라우트(app/api/consultations/tarot/clarifier/route.ts)가 import 하는
// @/lib/supabase · @/lib/session · @/lib/stars · @/lib/logger 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// shown-price-routes.test.ts 도 같은 방식으로 새 리딩·이어가기 라우트에 끼워 쓴다(가격 대조 409 와 그 다음 잔액 확인까지만 — insert 는 흉내 내지 않는다).
// 상태(행·메시지·잔액)는 테스트가 setWorld 로 넣는다. DB 호출 하나 = 원자적 한 걸음 — 실행 직전 world.gate() 에서
// 스케줄러가 이 요청의 차례를 줄 때까지 기다린다. 그래서 두 요청의 DB 호출 순서를 테스트가 정한다(결정적).
// 쿼리 빌더는 라우트·reopen-server 가 실제로 쓰는 체인만 흉내 낸다(from → select/update → eq/lt/like → order/maybeSingle/select).
// 모르는 메서드는 TypeError 로 테스트를 깨뜨린다 — 라우트가 새 체인을 쓰면 여기부터 늘려야 한다는 신호다.
import { AsyncLocalStorage } from "node:async_hooks";
import type { getServiceSupabase as GetServiceSupabase } from "../supabase.ts";
import type { getSession as GetSession } from "../session.ts";
import type { getStarBalance as GetStarBalance, spendStars as SpendStars } from "../stars.ts";
import type { logError as LogError, logWarn as LogWarn, LogContext } from "../logger.ts";

export type Row = Record<string, unknown>;

export interface World {
  /** readings · messages */
  tables: Record<string, Row[]>;
  balances: Record<string, number>;
  /** 성공한 차감만 — reqId 로 어느 요청이 돈을 냈는지 가린다 */
  spends: { reqId: number; amount: number; readingId: string | null; source: string | undefined }[];
  errors: { reqId: number; err: unknown }[];
  /** ctx = 라우트가 넘긴 로그 맥락(route·userId·extra) 그대로 */
  warns: { reqId: number; message: string; ctx?: LogContext }[];
  /** true 면 차감이 응답 없이 끊긴 것처럼 rpc_error(결과 불명)를 돌려준다 — 실제로는 차감 안 됨 */
  spendError?: boolean;
  /** DB 호출 직전 — 스케줄러가 이 요청의 차례를 줄 때까지 기다린다 */
  gate(reqId: number, op: string): Promise<void>;
}

/** 요청별 맥락 — 테스트가 als.run({ reqId, userId }, () => POST(req)) 로 감싼다 */
export const als = new AsyncLocalStorage<{ reqId: number; userId: string }>();

let world: World | null = null;
export function setWorld(w: World | null): void {
  world = w;
}

function current(): { w: World; reqId: number } {
  const ctx = als.getStore();
  if (!world || !ctx) throw new Error("clarifier-race fakes: setWorld·als.run 밖에서 호출됐다");
  return { w: world, reqId: ctx.reqId };
}

export const getSession: typeof GetSession = async () => {
  const userId = als.getStore()?.userId ?? null;
  return { userId, anonymousId: null, isAuthenticated: userId !== null };
};

export const getStarBalance: typeof GetStarBalance = async (userId) => {
  const { w, reqId } = current();
  await w.gate(reqId, "balance");
  return w.balances[userId] ?? 0;
};

/** spend_stars 처럼 잔액 확인과 차감이 한 걸음(원자) */
export const spendStars: typeof SpendStars = async (userId, amount, options) => {
  const { w, reqId } = current();
  await w.gate(reqId, "spend");
  if (w.spendError) return { success: false, balance: 0, reason: "rpc_error" };
  const balance = w.balances[userId] ?? 0;
  if (balance < amount) return { success: false, balance, reason: "insufficient" };
  w.balances[userId] = balance - amount;
  w.spends.push({ reqId, amount, readingId: options?.readingId ?? null, source: options?.source });
  return { success: true, balance: balance - amount, transactionId: `tx${w.spends.length}` };
};

export const logError: typeof LogError = async (err) => {
  const { w, reqId } = current();
  w.errors.push({ reqId, err });
};

export const logWarn: typeof LogWarn = async (message, ctx) => {
  const { w, reqId } = current();
  w.warns.push({ reqId, message, ctx });
};

type Filter = { kind: "eq" | "lt" | "like"; col: string; val: unknown };
type Result = { data: unknown; error: null };

/** Postgres LIKE(대소문자 구분) — % 는 아무 글자열(개행 포함), _ 는 한 글자 */
function likeToRegExp(pattern: string): RegExp {
  const body = [...pattern]
    .map((ch) => (ch === "%" ? "[\\s\\S]*" : ch === "_" ? "[\\s\\S]" : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${body}$`);
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  if (f.kind === "eq") return v === f.val;
  if (f.kind === "lt") return typeof v === "number" && typeof f.val === "number" && v < f.val;
  return typeof v === "string" && likeToRegExp(String(f.val)).test(v);
}

class FakeQuery implements PromiseLike<Result> {
  private mode: "select" | "update" = "select";
  private columns = "*";
  private payload: Row = {};
  private returning = false;
  private filters: Filter[] = [];
  private orderBy: { col: string; ascending: boolean } | null = null;
  private single = false;
  private result: Promise<Result> | null = null;

  constructor(private readonly table: string) {}

  select(columns: string): this {
    if (this.mode === "update") this.returning = true; // update(...).select(cols) = 갱신된 행을 돌려받는다
    this.columns = columns;
    return this;
  }
  update(payload: Row): this {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }
  lt(col: string, val: unknown): this {
    this.filters.push({ kind: "lt", col, val });
    return this;
  }
  like(col: string, val: string): this {
    this.filters.push({ kind: "like", col, val });
    return this;
  }
  order(col: string, opts: { ascending: boolean }): this {
    this.orderBy = { col, ascending: opts.ascending };
    return this;
  }
  maybeSingle(): this {
    this.single = true;
    return this;
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    this.result ??= this.run();
    return this.result.then(onfulfilled, onrejected);
  }

  private project(row: Row): Row {
    if (this.columns.trim() === "*") return structuredClone(row);
    return Object.fromEntries(this.columns.split(",").map((c) => c.trim()).map((c) => [c, structuredClone(row[c])]));
  }

  private async run(): Promise<Result> {
    const { w, reqId } = current();
    await w.gate(reqId, `${this.mode} ${this.table}`);
    // 차례를 받은 뒤부터 끝까지 동기 — 이 문장 하나가 원자적으로 적용된다(행 잠금·CAS 재평가와 같은 효과)
    const rows = (w.tables[this.table] ?? []).filter((r) => this.filters.every((f) => matches(r, f)));
    if (this.mode === "update") {
      for (const r of rows) Object.assign(r, structuredClone(this.payload));
      return { data: this.returning ? rows.map((r) => this.project(r)) : null, error: null };
    }
    const out = rows.map((r) => this.project(r));
    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (ascending ? 1 : -1));
    }
    if (this.single) {
      if (out.length > 1) throw new Error(`maybeSingle: ${this.table} 에서 ${out.length}행`);
      return { data: out[0] ?? null, error: null };
    }
    return { data: out, error: null };
  }
}

export const getServiceSupabase = (() => ({
  from: (table: string) => new FakeQuery(table),
})) as unknown as typeof GetServiceSupabase;
