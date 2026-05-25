// 클라이언트 에러 수집 엔드포인트
// lib/logger.ts 클라 → fetch('/api/log/error') → 여기 → Supabase
//
// 보안:
// - rate limit (IP 분당 30건)
// - body 사이즈 제한 (32KB)
// - source 강제 'client' 로 덮어쓰기 (위조 방지)
// - user_id/anonymous_id 는 서버 세션에서 추출 (클라이언트가 보낸 값 무시)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt < now) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const ALLOWED_LEVELS = new Set(["error", "warn", "info"]);

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // 32KB 제한
  const text = await req.text();
  if (text.length > 32 * 1024) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const level =
    typeof body.level === "string" && ALLOWED_LEVELS.has(body.level)
      ? body.level
      : "error";
  const message = typeof body.message === "string" ? body.message : "";
  if (!message) {
    return NextResponse.json({ error: "no_message" }, { status: 400 });
  }

  // 세션 정보 보강 (클라이언트가 보낸 user_id 신뢰 X)
  const session = await getSession();

  const payload = {
    level,
    source: "client" as const, // 클라 라우트는 무조건 client
    message: message.slice(0, 2000),
    stack:
      typeof body.stack === "string" ? body.stack.slice(0, 8000) : null,
    fingerprint:
      typeof body.fingerprint === "string"
        ? body.fingerprint.slice(0, 64)
        : "00000000",
    route: typeof body.route === "string" ? body.route : null,
    user_id: session.userId ?? null,
    anonymous_id: session.anonymousId ?? null,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    ip: ip.slice(0, 64),
    context:
      body.context && typeof body.context === "object" ? body.context : null,
  };

  try {
    const supa = getServiceSupabase();
    const { error } = await supa.from("error_logs").insert(payload);
    if (error) {
      console.error("[/api/log/error] insert failed:", error);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/log/error] crash:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
