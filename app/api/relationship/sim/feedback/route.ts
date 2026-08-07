// app/api/relationship/sim/feedback/route.ts — 인형 대사 피드백(👍/👎) → 상대 성격 personality 즉시 반영.
// 인형은 다음 say 턴에 loadSim 이 갱신된 personality 를 재조회 → buildDollSystemMessage 가 자동 반영(별도 배선 없음).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import { appendPersonalityNote } from "@/lib/relationship/sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTE_LEN = 300;

interface Body { simReadingId: string; kind: "up" | "down"; note?: string }

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({ namespace: "sim_feedback_session", key: userId, max: 30, windowMs: 60_000 });
  const byIp = checkRateLimit({ namespace: "sim_feedback_ip", key: ip, max: 60, windowMs: 60_000 });
  if (!bySession.ok || !byIp.ok)
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const kind = body.kind;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LEN) : "";
  if (!body.simReadingId || (kind !== "up" && kind !== "down") || !note)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("id, user_id, relationship_id, consultation_type")
    .eq("id", body.simReadingId)
    .maybeSingle();
  if (!reading || reading.user_id !== userId || reading.consultation_type !== "relationship_sim")
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: rel } = await supabase
    .from("relationships")
    .select("id, partner_profile_id")
    .eq("id", reading.relationship_id)
    .maybeSingle();
  if (!rel?.partner_profile_id)
    return NextResponse.json({ error: "no_profile", code: "NO_PROFILE" }, { status: 409 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("personality")
    .eq("id", rel.partner_profile_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile)
    return NextResponse.json({ error: "no_profile", code: "NO_PROFILE" }, { status: 409 });

  const next = appendPersonalityNote(profile.personality ?? null, note);
  const { error: uErr } = await supabase
    .from("user_profiles")
    .update({ personality: next })
    .eq("id", rel.partner_profile_id)
    .eq("user_id", userId);
  if (uErr) {
    await logError(uErr, ctxFromRequest(request, { route: "/api/relationship/sim/feedback", userId, extra: { simReadingId: reading.id, kind } }));
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, personality: next });
}
