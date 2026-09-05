// app/api/byeolmaru/watch/route.ts — 우리 오늘 지켜보는 상대 관리. 구독 전용(비구독=차단).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { getWatchState, addWatch, removeWatch } from "@/lib/byeolmaru/watch";
import { logError, ctxFromRequest } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function requireEntitled(userId: string | null) {
  if (!userId) return { code: 401 as const, body: { error: "Login required", code: "LOGIN_REQUIRED" } };
  const ent = await getEntitlement(userId);
  if (!ent.entitled) return { code: 403 as const, body: { error: "subscription_required", code: "LOCKED" } };
  return null;
}

// GET — 담은 상대 목록 + 추천(아직 안 담은 비-self 프로필) + 현황(allowed/used/nextCost).
export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  const gate = await requireEntitled(userId);
  if (gate) return NextResponse.json(gate.body, { status: gate.code });

  try {
    const supa = getServiceSupabase();
    const { data: profiles, error: profilesErr } = await supa
      .from("user_profiles")
      .select("id, display_name, relation_type, birth_date, is_primary")
      .eq("user_id", userId);
    const { data: watched, error: watchedErr } = await supa
      .from("byeolmaru_watch")
      .select("profile_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (profilesErr || watchedErr) {
      await logError(profilesErr ?? watchedErr, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    const watchedIds = new Set((watched ?? []).map((w) => w.profile_id));
    // 우리 오늘 후보 = 비-self(내 프로필 제외) + 생일 있음(사주 계산 필수).
    const candidates = (profiles ?? []).filter((p) => !p.is_primary && p.birth_date);

    return NextResponse.json({
      watched: candidates.filter((p) => watchedIds.has(p.id)).map((p) => ({ id: p.id, name: p.display_name })),
      suggestions: candidates.filter((p) => !watchedIds.has(p.id)).map((p) => ({ id: p.id, name: p.display_name })),
      state: await getWatchState(userId!),
    });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// POST { profileId } — 상대를 담는다(소유·비-self·생일 검증 → 중복 pre-filter → addWatch).
export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  const gate = await requireEntitled(userId);
  if (gate) return NextResponse.json(gate.body, { status: gate.code });

  let profileId: string;
  try {
    const body = await req.json();
    profileId = String(body?.profileId ?? "");
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

    // 🔴 중복 pre-filter — 이미 담은 상대면 addWatch(별 차감 가능)를 호출하지 않고 그대로 성공 처리한다.
    // supabase-js 는 { head:true, count:"exact" } 일 때 카운트를 data 가 아니라 응답의 count 필드로 준다.
    const { count: dupCount, error: dupErr } = await supa
      .from("byeolmaru_watch")
      .select("profile_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("profile_id", profileId);
    if (dupErr) {
      await logError(dupErr, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    if (dupCount && dupCount > 0) {
      return NextResponse.json({ ok: true, charged: 0 });
    }

    const res = await addWatch(userId!, profileId);
    if (!res.success && res.reason === "insufficient") {
      return NextResponse.json({ error: "insufficient_balance", code: "NEED_STARS" }, { status: 402 });
    }
    if (!res.success) {
      return NextResponse.json({ error: res.reason ?? "add_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, charged: res.charged });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/watch", userId: userId! }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// DELETE ?profileId=... — 상대를 뺀다.
export async function DELETE(req: NextRequest) {
  const { userId } = await getSession();
  const gate = await requireEntitled(userId);
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
