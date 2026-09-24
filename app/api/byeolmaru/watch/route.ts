// app/api/byeolmaru/watch/route.ts — 우리 오늘 걸어둔 상대 관리. 로그인-only.
// 🔴 상대는 **한 명**이다(2026-09-24) — 슬롯·과금(2무료+5별)은 제거됐다. POST 는 추가가 아니라
//    **교체**이고 무료다. 근거·되돌리기 보장은 lib/byeolmaru/watch.ts 머리 주석 참조.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { setWatch, removeWatch } from "@/lib/byeolmaru/watch";
import { logError, ctxFromRequest } from "@/lib/logger";
import type { RelationshipStatus } from "@/lib/relationship/types";

const VALID_STATUS = ["crush", "dating", "breakup", "onesided"] as const;

export const dynamic = "force-dynamic";

// 우리 오늘 무료 개방(1A): 상대 등록·조회는 로그인만 필요하다(구독 아님). 별 코스트는 이제 없다.
async function requireLogin(userId: string | null) {
  if (!userId) return { code: 401 as const, body: { error: "Login required", code: "LOGIN_REQUIRED" } };
  return null;
}

// GET — 걸어둔 상대(0 또는 1명) + 후보(아직 안 건 비-self 프로필).
export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  const gate = await requireLogin(userId);
  if (gate) return NextResponse.json(gate.body, { status: gate.code });

  try {
    const supa = getServiceSupabase();
    const { data: profiles, error: profilesErr } = await supa
      .from("user_profiles")
      .select("id, display_name, relation_type, birth_date, is_primary")
      .eq("user_id", userId);
    const { data: watched, error: watchedErr } = await supa
      .from("byeolmaru_watch")
      .select("profile_id, created_at, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (profilesErr || watchedErr) {
      await logError(profilesErr ?? watchedErr, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    const watchedStatusById = new Map(
      (watched ?? []).map((w) => [w.profile_id, w.status as RelationshipStatus | null])
    );
    const watchedIds = new Set((watched ?? []).map((w) => w.profile_id));
    // 우리 오늘 후보 = 비-self(내 프로필 제외) + 생일 있음(사주 계산 필수).
    const candidates = (profiles ?? []).filter((p) => !p.is_primary && p.birth_date);

    return NextResponse.json({
      watched: candidates.filter((p) => watchedIds.has(p.id)).map((p) => ({
        id: p.id, name: p.display_name, status: watchedStatusById.get(p.id) ?? null,
      })),
      suggestions: candidates.filter((p) => !watchedIds.has(p.id)).map((p) => ({ id: p.id, name: p.display_name })),
    });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// POST { profileId, status } — 걸어둘 상대를 **설정**한다(추가가 아니라 교체·무료).
//    소유·비-self·생일 검증 → setWatch(기존 행 교체).
export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  const gate = await requireLogin(userId);
  if (gate) return NextResponse.json(gate.body, { status: gate.code });

  let profileId: string;
  let status: RelationshipStatus | null;
  try {
    const body = await req.json();
    profileId = String(body?.profileId ?? "");
    if (body?.status === undefined || body?.status === null) {
      status = null;
    } else if ((VALID_STATUS as readonly string[]).includes(body.status)) {
      status = body.status as RelationshipStatus;
    } else {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!profileId) return NextResponse.json({ error: "profileId_required" }, { status: 400 });

  try {
    const supa = getServiceSupabase();
    // 소유 + 비-self + 생일 검증(내 프로필/남의 프로필/생일없는 프로필 담기 방지).
    const { data: p, error: pErr } = await supa
      .from("user_profiles")
      .select("id, is_primary, birth_date")
      .eq("id", profileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr) {
      await logError(pErr, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    if (!p || p.is_primary || !p.birth_date) {
      return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
    }

    // 🔴 중복 pre-filter 가 사라졌다(2026-09-24) — 상대가 한 명이라 "이미 담았나"를 먼저 볼 이유가
    //    없다. setWatch 가 기존 행을 지우고 넣으므로 같은 상대를 다시 눌러도 결과가 같고,
    //    별을 태우지 않으므로 중복 과금 위험 자체가 없어졌다(그 pre-filter 의 목적이 그거였다).
    const res = await setWatch(userId!, profileId, status);
    if (!res.success) {
      await logError(new Error(res.reason ?? "set_watch_failed"), ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
      return NextResponse.json({ error: "set_failed" }, { status: 500 });
    }
    // charged 는 호환을 위해 남기지 않는다 — 호출부(WatchAddModal)를 같이 고친다.
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// DELETE ?profileId=... — 상대를 뺀다.
export async function DELETE(req: NextRequest) {
  const { userId } = await getSession();
  const gate = await requireLogin(userId);
  if (gate) return NextResponse.json(gate.body, { status: gate.code });

  const profileId = new URL(req.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId_required" }, { status: 400 });

  try {
    const res = await removeWatch(userId!, profileId);
    return NextResponse.json({ ok: res.success });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
