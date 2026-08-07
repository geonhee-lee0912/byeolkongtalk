// app/api/relationship/sim/route.ts — 시뮬 세션 생성. SIM_COST 차감 + 판 reading 생성 + 프레임 고지 노트 시드.
// Claude 호출 없음(프레임 고지는 결정적) → 동기 처리. 대화는 별도 chat 라우트.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, chargeStars } from "@/lib/stars";
import { logError, ctxFromRequest } from "@/lib/logger";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { SIM_COST, RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";
import { getSituation } from "@/lib/relationship/situations";
import type { SimMeta } from "@/lib/relationship/sim";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTEXT_LEN = 500;

interface Body {
  relationshipId: string;
  situationId: string;
  userContext?: string; // ①-b 라이트 컨텍스트(선택)
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({ namespace: "sim_create_session", key: userId, max: 10, windowMs: 60_000 });
  const byIp = checkRateLimit({ namespace: "sim_create_ip", key: ip, max: 20, windowMs: 60_000 });
  if (!bySession.ok || !byIp.ok)
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const situation = typeof body.situationId === "string" ? getSituation(body.situationId) : null;
  if (!body.relationshipId || !situation)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const userContext =
    typeof body.userContext === "string" && body.userContext.trim()
      ? body.userContext.trim().slice(0, MAX_CONTEXT_LEN)
      : null;

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, user_id, label, status, partner_profile_id")
    .eq("id", body.relationshipId)
    .maybeSingle();
  if (!rel || rel.user_id !== userId)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  // 프로필 없는 상대는 시뮬 진입 불가 — 인형은 상대 프로필(성격·MBTI)로 빚어지므로 프로필이 전제다.
  // (레거시 관계 방어. 차감 전 게이트라 환불 불필요.)
  if (!rel.partner_profile_id)
    return NextResponse.json({ error: "no_profile", code: "NO_PROFILE" }, { status: 409 });

  // 판 고정가 차감 (서버 최종 권위). 실패 → 402 → 클라 /shop.
  const spend = await spendStars(userId, SIM_COST, { source: "relationship_sim" });
  if (!spend.success)
    return NextResponse.json(
      { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: SIM_COST },
      { status: 402 }
    );

  // ── 차감 완료 지점 ── 이후 실패는 반드시 환불.
  const refund = async () => {
    const r = await chargeStars(userId, SIM_COST, `refund_${randomUUID()}`, "relationship_sim_refund").catch(() => null);
    if (!r?.success)
      await logError(new Error("sim_refund_failed"), ctxFromRequest(request, { route: "/api/relationship/sim", userId, extra: { relationshipId: rel.id } }));
  };

  const meta: SimMeta = { situationId: situation.id, userContext, phase: "stage" };
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      relationship_id: rel.id,
      consultation_type: "relationship_sim",
      question: situation.label, // 보관함 표시용(운세의 cfg.label 패턴)
      saju_data: meta,           // 판 메타 부속(스펙 §8 — saju_data JSONB 재사용)
      profile_id: null,
      stars_spent: SIM_COST,
      has_sensitive: false,
    })
    .select("id")
    .single();
  if (rErr || !reading) {
    await refund();
    await logError(rErr ?? new Error("sim reading insert null"), ctxFromRequest(request, { route: "/api/relationship/sim", userId, extra: { stage: "reading_insert", relationshipId: rel.id } }));
    return NextResponse.json({ error: "sim_create_failed", refunded: true }, { status: 500 });
  }

  // 프레임 고지 = 결정적 별콩이 노트(제품 발화, 스펙 §2). skill_key='sim_note' 라 인형 대화 교대·턴캡 카운트에서 제외.
  const statusLabel = RELATIONSHIP_STATUS_LABELS[rel.status as RelationshipStatus] ?? rel.status;
  const frame = `별콩이가 ${rel.label} 인형을 데려왔어. 진짜 걔가 아니라 네 마음속 ${rel.label}야. 편하게 말 걸어봐. 혹시 인형이 실제 걔랑 다르게 굴면 대사 밑 👍👎로 알려줘 — 내가 더 걔답게 만들어줄게. (지금은 "${situation.label}" 상황이야.)`;
  await supabase.from("messages").insert([
    { reading_id: reading.id, role: "assistant", content: frame, skill_key: "sim_note" },
  ]);

  return NextResponse.json({
    simReadingId: reading.id,
    situationId: situation.id,
    statusLabel,
    frame,
    contextPrompt: situation.contextPrompt, // 클라 ①-b 질문 노출용
    cost: SIM_COST,
    balance: spend.balance,
    success: true,
  });
}
