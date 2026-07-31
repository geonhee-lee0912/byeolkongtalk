// UI 이벤트 비콘 수집. lib/analytics/ui-events 의 trackUiEvent → 여기 → ui_events
//
// 왜: 출구 칩 노출이 순수 클라 상태라 "칩이 안 떴다" vs "떴는데 안 눌렀다" 를 가를
// 서버측 흔적이 하나도 없었다 (supabase/migrations/20260731070000_ui_events.sql 참조).
//
// 보안·정합 (/api/pv 와 동일 관행):
// - anon_id/user_id 는 서버 세션에서만 추출 (클라가 보낸 값 무시 — 위조 방지)
// - event 는 allowlist 검증 — 오타가 새 버킷을 만들면 아무도 집계하지 않는다
// - rate limit IP 분당 60건 (UI 상호작용이라 페이지뷰보다 훨씬 드물다) + body 2KB 상한
// - 실패는 무음 204 — 계측이 제품 동작을 막으면 안 된다.
//   단 "클라에 무음"이지 "운영자에게도 무음"은 아니다 → 실패는 console 로 남긴다
//   (pv·log/error 와 동일 패턴). 로그가 없으면 기능이 100% 죽어도 무증상이 된다

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { isUiEvent } from "@/lib/analytics/ui-events";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const MAX_BODY_CHARS = 2048;
const MAX_META_CHARS = 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

/**
 * meta 는 작게 유지한다 — 컬럼이 아니라 JSONB 라 커지면 테이블이 그대로 붓는다.
 * 객체가 아니거나 상한을 넘으면 이벤트는 살리고 meta 만 버린다(행 유실 > meta 유실).
 */
function sanitizeMeta(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const json = JSON.stringify(v);
  if (!json || json.length > MAX_META_CHARS) return null;
  return v as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  // 라우트 전체를 무음 경계로 감싼다 — req.text() 는 Content-Length 불일치·모바일 네트워크
  // 중단 등 truncated 요청에서 reject 하고, 미처리 시 500 + 함수 에러 카운트로 실제 장애 신호를 묻는다
  try {
    maybeSweepExpired();
    const { ok } = checkRateLimit({
      namespace: "ui-event",
      key: getClientIp(req),
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!ok) return NO_CONTENT();

    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return NO_CONTENT();

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      // JSON.parse("null") 은 throw 하지 않으므로 객체 여부를 따로 본다
      if (!parsed || typeof parsed !== "object") return NO_CONTENT();
      body = parsed as Record<string, unknown>;
    } catch {
      return NO_CONTENT();
    }

    const event = body.event;
    if (!isUiEvent(event)) {
      // 오타·구버전 클라. 저장은 안 하되 운영자에겐 보이게 — 조용히 삼키면 계측이 죽어도 모른다
      console.warn("[/api/event] unknown event:", String(event).slice(0, 60));
      return NO_CONTENT();
    }

    // reading_id 는 readings(id) FK. UUID 모양이 아니면 22P02 로 insert 전체가 죽으므로
    // 이벤트를 살리기 위해 null 로 강등한다
    const readingId =
      typeof body.readingId === "string" && UUID_RE.test(body.readingId)
        ? body.readingId
        : null;

    const session = await getSession();

    const row = {
      anon_id: session.anonymousId ?? null,
      user_id: session.userId ?? null,
      event,
      reading_id: readingId,
      meta: sanitizeMeta(body.meta),
    };

    const supa = getServiceSupabase();
    // supabase-js 는 DB 에러를 throw 하지 않고 { error } 로 반환한다 — 확인하지 않으면
    // 마이그레이션 미적용(relation does not exist) 같은 전면 장애도 204 에 묻힌다
    const { error } = await supa.from("ui_events").insert(row);
    if (error?.code === "23503") {
      // FK 위반 = byeolkong_user_id 쿠키(maxAge 1년)가 이미 탈퇴한 유저를 가리키는 스테일 상태.
      // user_id 를 떼고 anon 귀속으로 살린다 — 행을 버리면 노출 수가 조용히 줄어
      // "칩이 안 떴다" 로 오독된다. reading_id 쪽 위반이면 재시도도 실패하고 아래에 남는다
      const { error: retryError } = await supa
        .from("ui_events")
        .insert({ ...row, user_id: null });
      if (retryError) {
        console.error("[/api/event] insert retry failed:", retryError);
      }
    } else if (error) {
      console.error("[/api/event] insert failed:", error);
    }
  } catch (e) {
    console.error("[/api/event] crash:", e);
  }
  return NO_CONTENT();
}
