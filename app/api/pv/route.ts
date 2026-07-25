// 페이지뷰 비콘 수집. components/analytics/PageViewBeacon.tsx → 여기 → Supabase
//
// 보안·정합:
// - anon_id/user_id 는 서버 세션에서만 추출 (클라가 보낸 값 무시 — 위조 방지)
// - path 는 정규화 후 저장 (동적 세그먼트 :id 로 접어 카디널리티 억제)
// - 봇 UA 는 is_bot=true 로 표시만 하고 저장 (필터는 분석 쿼리에서)
// - rate limit IP 분당 120건 (페이지뷰는 에러 로그보다 잦다)
// - 실패는 무음 204 — 계측이 제품 동작을 막으면 안 된다

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { isBotUserAgent, normalizePath } from "@/lib/analytics/pageview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
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

const str = (v: unknown, n = 120): string | null =>
  typeof v === "string" && v ? v.slice(0, n) : null;

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(ip)) return NO_CONTENT();

  const text = await req.text();
  if (text.length > 4096) return NO_CONTENT();

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    // JSON.parse("null") 은 throw 하지 않으므로 객체 여부를 따로 본다 (아래 body.path 접근이 터지면 500)
    if (!parsed || typeof parsed !== "object") return NO_CONTENT();
    body = parsed as Record<string, unknown>;
  } catch {
    return NO_CONTENT();
  }

  const path = normalizePath(body.path);
  if (!path) return NO_CONTENT();

  const session = await getSession();

  try {
    const supa = getServiceSupabase();
    await supa.from("page_views").insert({
      anon_id: session.anonymousId ?? null,
      user_id: session.userId ?? null,
      path,
      utm_source: str(body.utm_source),
      utm_medium: str(body.utm_medium),
      utm_campaign: str(body.utm_campaign),
      utm_content: str(body.utm_content),
      utm_term: str(body.utm_term),
      landing_variant: str(body.landing_variant, 40),
      referrer: str(body.referrer, 200),
      is_bot: isBotUserAgent(req.headers.get("user-agent")),
    });
  } catch {
    // 무음 — 계측 실패가 제품에 영향을 주지 않는다
  }
  return NO_CONTENT();
}
