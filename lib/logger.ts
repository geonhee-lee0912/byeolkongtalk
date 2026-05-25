// 자체 에러 로거 — Sentry 대체.
// 서버: Supabase service_role 로 직접 INSERT
// 클라: /api/log/error POST → 서버 라우트에서 INSERT
//
// 사용법:
//   try { ... } catch (err) {
//     await logError(err, { route: "/api/saju", userId, extra: { ... } });
//   }

import { getServiceSupabase } from "@/lib/supabase";

export type LogLevel = "error" | "warn" | "info";

export interface LogContext {
  route?: string;
  userId?: string | null;
  anonymousId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  extra?: Record<string, unknown>;
}

interface LogPayload {
  level: LogLevel;
  source: "server" | "client" | "edge";
  message: string;
  stack?: string | null;
  fingerprint: string;
  route?: string | null;
  user_id?: string | null;
  anonymous_id?: string | null;
  user_agent?: string | null;
  ip?: string | null;
  context?: Record<string, unknown> | null;
}

const isServer = typeof window === "undefined";

function isUuid(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

function fingerprint(message: string, stack?: string | null): string {
  const stackHead = (stack || "").split("\n")[0] || "";
  const seed = `${message}::${stackHead}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function normalize(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return {
      message: err.message || err.name || "Error",
      stack: err.stack ?? null,
    };
  }
  if (typeof err === "string") return { message: err, stack: null };
  try {
    return { message: JSON.stringify(err), stack: null };
  } catch {
    return { message: String(err), stack: null };
  }
}

function buildPayload(
  level: LogLevel,
  message: string,
  stack: string | null,
  ctx: LogContext
): LogPayload {
  // user_id 는 UUID 형식이 아니면 anonymous_id 로 강등 (Phase 4 b 에서 users 테이블 + FK 추가 예정)
  const userIdValid = isUuid(ctx.userId);

  return {
    level,
    source: isServer ? "server" : "client",
    message: message.slice(0, 2000),
    stack: stack?.slice(0, 8000) ?? null,
    fingerprint: fingerprint(message, stack),
    route: ctx.route ?? null,
    user_id: userIdValid ? ctx.userId! : null,
    anonymous_id: userIdValid
      ? ctx.anonymousId ?? null
      : ctx.userId ?? ctx.anonymousId ?? null,
    user_agent: ctx.userAgent ?? null,
    ip: ctx.ip ?? null,
    context: ctx.extra ?? null,
  };
}

async function writeServer(payload: LogPayload): Promise<void> {
  try {
    const supa = getServiceSupabase();
    await supa.from("error_logs").insert(payload);
  } catch (e) {
    // logger 자체는 절대 throw 하지 않음
    console.error("[logger] Supabase insert failed:", e);
  }
}

async function writeClient(payload: LogPayload): Promise<void> {
  try {
    await fetch("/api/log/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // 페이지 unload 중에도 전송 시도
    });
  } catch {
    // 네트워크 에러는 swallow — logger 가 실패해도 앱은 계속
  }
}

export async function logError(
  err: unknown,
  ctx: LogContext = {}
): Promise<void> {
  const { message, stack } = normalize(err);
  const payload = buildPayload("error", message, stack, ctx);

  if (isServer) {
    console.error(`[error] ${payload.route ?? "?"}`, message, ctx.extra ?? "");
    await writeServer(payload);
  } else {
    console.error(`[error]`, message, ctx.extra ?? "");
    await writeClient(payload);
  }
}

export async function logWarn(
  message: string,
  ctx: LogContext = {}
): Promise<void> {
  const payload = buildPayload("warn", message, null, ctx);

  if (isServer) {
    console.warn(`[warn] ${payload.route ?? "?"}`, message, ctx.extra ?? "");
    await writeServer(payload);
  } else {
    console.warn(`[warn]`, message, ctx.extra ?? "");
    await writeClient(payload);
  }
}

// 서버 라우트에서 Request 받아서 user_agent/ip 자동 추출
export function ctxFromRequest(
  req: Request,
  base: LogContext = {}
): LogContext {
  return {
    ...base,
    userAgent: base.userAgent ?? req.headers.get("user-agent"),
    ip:
      base.ip ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip"),
  };
}
