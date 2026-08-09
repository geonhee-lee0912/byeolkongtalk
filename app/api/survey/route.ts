// 정성 이탈조사 설문 — GET(참여 자격) + POST(제출·검증·저장·보상).
// 보안: user_id/anon_id 는 서버 세션에서만(클라 위조 무시, /api/event 관행).
// 보상은 저장 성공 후 chargeStars(멱등키 survey:userId — 재호출 안전).

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { validateSurveyAnswers } from "@/lib/survey/questions";
import { chargeStars } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { SURVEY_REWARD_STARS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 참여 자격 = 로그인 && 미참여. 결과화면 카드·설문 페이지가 이걸로 노출/차단 판정.
export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ eligible: false, participated: false });
  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from("survey_responses")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // 조회 실패 시 자격 없음(카드 숨김) — 계측이 제품 경로를 막지 않는다
    await logError(error, {
      route: "/api/survey",
      userId,
      extra: { severity: "SURVEY_LOOKUP_FAILED" },
    });
    return NextResponse.json({ eligible: false, participated: false });
  }
  const participated = !!data;
  return NextResponse.json({ eligible: !participated, participated });
}

export async function POST(req: NextRequest) {
  const { userId, anonymousId } = await getSession();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "auth" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_json" }, { status: 400 });
  }
  const answers = (body as { answers?: unknown })?.answers;
  const v = validateSurveyAnswers(answers);
  if (!v.ok) {
    return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const { error: insertError } = await supa.from("survey_responses").insert({
    user_id: userId,
    anon_id: anonymousId ?? null,
    answers: v.normalized,
  });
  if (insertError) {
    // 23505 = partial unique 위반 = 이미 참여(1인 1회)
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: false, reason: "already" }, { status: 409 });
    }
    await logError(insertError, {
      route: "/api/survey",
      userId,
      extra: { severity: "SURVEY_SAVE_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "save" }, { status: 500 });
  }

  // 저장 성공 → 보상. 저장은 됐는데 보상이 실패해도(희박) 응답은 성공으로 —
  // 재제출은 409 로 막히므로 여기서 throw 하면 유저가 별 없이 잠긴다. 실패는 로그로.
  const charge = await chargeStars(
    userId,
    SURVEY_REWARD_STARS,
    `survey:${userId}`,
    "survey_reward"
  );
  if (!charge.success) {
    // 저장은 성공했으나 보상 지급 실패 — 재제출은 409 로 막혀 재시도로 복구 불가.
    // 운영자가 error_logs 로 보고 수동 지급해야 하는 사고 → CRITICAL.
    await logError(new Error("chargeStars failed after survey save"), {
      route: "/api/survey",
      userId,
      extra: { reward: SURVEY_REWARD_STARS, severity: "CRITICAL_SURVEY_REWARD_LOST" },
    });
  }
  return NextResponse.json({
    ok: true,
    reward: SURVEY_REWARD_STARS,
    balance: charge.balance,
  });
}
