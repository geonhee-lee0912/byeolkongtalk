// 페이지뷰 비콘 수집. components/analytics/PageViewBeacon.tsx → 여기 → Supabase
//
// 보안·정합:
// - anon_id/user_id 는 서버 세션에서만 추출 (클라가 보낸 값 무시 — 위조 방지)
// - path 는 정규화 후 저장 (동적 세그먼트 :id 로 접어 카디널리티 억제)
// - 봇 UA 는 is_bot=true 로 표시만 하고 저장 (필터는 분석 쿼리에서)
// - rate limit IP 분당 120건 (페이지뷰는 에러 로그보다 잦다)
// - 실패는 무음 204 — 계측이 제품 동작을 막으면 안 된다.
//   단 "클라에 무음"이지 "운영자에게도 무음"은 아니다 → 실패는 console.error 로 남긴다
//   (log/error 라우트와 동일 패턴). 로그가 없으면 기능이 100% 죽어도 무증상이 된다

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
  // 라우트 전체를 무음 경계로 감싼다 — req.text() 는 Content-Length 불일치·모바일 네트워크 중단 등
  // truncated 요청에서 reject 하고, 미처리 시 500 + 함수 에러 카운트로 실제 장애 신호를 묻는다
  try {
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

    const row = {
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
    };

    const supa = getServiceSupabase();
    // supabase-js 는 DB 에러를 throw 하지 않고 { error } 로 반환한다 — 확인하지 않으면
    // 마이그레이션 미적용(relation does not exist) 같은 전면 장애도 204 에 묻힌다
    const { error } = await supa.from("page_views").insert(row);
    if (error?.code === "23503") {
      // FK 위반 = byeolkong_user_id 쿠키(maxAge 1년)가 이미 탈퇴한 유저를 가리키는 스테일 상태.
      // /api/auth/me 는 이 경우 응답만 게스트로 강등하고 쿠키는 지우지 않으므로 다른 기기엔
      // 죽은 id 가 최대 1년 남는다. user_id 를 떼고 anon 귀속으로 살려 row 전체 유실을 막는다
      // (그냥 버리면 "탈퇴 후 재방문" 코호트가 통계에서 조용히 사라진다).
      const { error: retryError } = await supa
        .from("page_views")
        .insert({ ...row, user_id: null });
      if (retryError) {
        console.error("[/api/pv] insert retry failed:", retryError);
      }
    } else if (error) {
      console.error("[/api/pv] insert failed:", error);
    }
  } catch (e) {
    console.error("[/api/pv] crash:", e);
  }
  return NO_CONTENT();
}
