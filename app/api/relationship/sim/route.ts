// app/api/relationship/sim/route.ts — 시뮬 세션 생성. SIM_COST 차감 + 판 reading 생성 + 프레임 고지 노트 시드.
// Claude 호출 없음(프레임 고지는 결정적) → 동기 처리. 대화는 별도 chat 라우트.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, chargeStars, getStarBalance } from "@/lib/stars";
import { logError, ctxFromRequest } from "@/lib/logger";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { SIM_COST, RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";
import { getSituation } from "@/lib/relationship/situations";
import { buildSimFrame, type SimMeta } from "@/lib/relationship/sim";
import { determineSimFunding } from "@/lib/relationship/sim-funding";
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

  // ── 자금원 판별(서버 권위): 런웨이(관계당 3) → 훅(유저당 7일 롤링 1) → 유료. 쿼트 라우트와 공유(드리프트 방지). ──
  const { funding } = await determineSimFunding(supabase, userId, rel.id);

  // 유료만 차감(서버 최종 권위). 무료 판은 skip + 현재 잔액 조회. 실패 → 402 → 클라 /shop.
  let balance: number;
  if (funding === "paid") {
    const spend = await spendStars(userId, SIM_COST, { source: "relationship_sim" });
    if (!spend.success)
      return NextResponse.json(
        { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: SIM_COST },
        { status: 402 }
      );
    balance = spend.balance;
  } else {
    balance = await getStarBalance(userId);
  }
  const cost = funding === "paid" ? SIM_COST : 0;

  // ── 유료 판만 환불 대상 ── 이후 실패 시 차감했으면 되돌린다.
  const refund = async () => {
    if (funding !== "paid") return;
    const r = await chargeStars(userId, SIM_COST, `refund_${randomUUID()}`, "relationship_sim_refund").catch(() => null);
    if (!r?.success)
      await logError(new Error("sim_refund_failed"), ctxFromRequest(request, { route: "/api/relationship/sim", userId, extra: { relationshipId: rel.id } }));
  };

  const meta: SimMeta = { situationId: situation.id, userContext, phase: "stage", funding };
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      relationship_id: rel.id,
      consultation_type: "relationship_sim",
      question: situation.label, // 보관함 표시용(운세의 cfg.label 패턴)
      saju_data: meta,           // 판 메타 부속(스펙 §8 — saju_data JSONB 재사용)
      profile_id: null,
      stars_spent: cost,
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
  const frame = buildSimFrame(rel.label, situation.label);
  await supabase.from("messages").insert([
    { reading_id: reading.id, role: "assistant", content: frame, skill_key: "sim_note" },
  ]);

  return NextResponse.json({
    simReadingId: reading.id,
    situationId: situation.id,
    statusLabel,
    frame,
    contextPrompt: situation.contextPrompt, // 클라 ①-b 질문 노출용
    cost,
    balance,
    success: true,
  });
}

// 재진입용 판 상태 조회(읽기 전용) — 재개(stage)·재열람(debriefed) 공용. 차감/변경 없음.
export async function GET(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  maybeSweepExpired();
  const bySession = checkRateLimit({ namespace: "sim_get", key: userId, max: 60, windowMs: 60_000 });
  if (!bySession.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("id, user_id, relationship_id, consultation_type, saju_data, question")
    .eq("id", id)
    .maybeSingle();
  if (!reading || reading.user_id !== userId || reading.consultation_type !== "relationship_sim")
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const meta = (reading.saju_data ?? {}) as SimMeta;
  // situationLabel = 생성 시 저장된 question(=상황 라벨). getSituation 재조회 안 함 →
  // 카탈로그에서 은퇴한 situationId 완료 판도 재열람 가능(404 게이트 제거, 2026-08-09 fast-follow).
  const situationLabel = reading.question ?? "지난 연습";

  const { data: rel } = await supabase
    .from("relationships")
    .select("id, label, status, partner_profile_id")
    .eq("id", reading.relationship_id)
    .maybeSingle();
  if (!rel) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const statusLabel = RELATIONSHIP_STATUS_LABELS[rel.status as RelationshipStatus] ?? rel.status;
  const frame = buildSimFrame(rel.label, situationLabel);

  const { data: rows } = await supabase
    .from("messages")
    .select("role, content, skill_key")
    .eq("reading_id", reading.id)
    .order("created_at", { ascending: true });

  // 전사 매핑: 프레임(별도 반환)·디브리핑(별도) 제외, 나머지를 who 로.
  // 프레임 고지는 "항상 첫 메시지"(생성 시 단독 insert 되는 sim_note assistant)라 인덱스로 스킵한다.
  // ⚠️ content 비교(=frame)는 라벨 변경 시 저장 시드와 안 맞아 프레임이 이중 렌더된다 → 구조(인덱스0)로 식별
  // (라벨 무관 + 기존 판·프레임 insert 실패 판까지 안전. 2026-08-09 리뷰 지적).
  const rowList = (rows ?? []) as { role: string; content: string; skill_key: string | null }[];
  const messages: { who: "user" | "doll" | "note"; text: string }[] = [];
  let debrief: string | null = null;
  for (let i = 0; i < rowList.length; i++) {
    const m = rowList[i];
    if (i === 0 && m.skill_key === "sim_note" && m.role === "assistant") continue; // 프레임 고지
    if (m.skill_key === "sim_debrief") { debrief = m.content; continue; }
    if (m.role === "user") messages.push({ who: "user", text: m.content });
    else if (m.skill_key === "sim_note") messages.push({ who: "note", text: m.content });
    else messages.push({ who: "doll", text: m.content });
  }

  let portrait = "";
  if (rel.partner_profile_id) {
    const { data: p } = await supabase
      .from("user_profiles").select("personality")
      .eq("id", rel.partner_profile_id).eq("user_id", userId).maybeSingle();
    portrait = p?.personality ?? "";
  }

  return NextResponse.json({
    simReadingId: reading.id,
    relationshipId: reading.relationship_id,
    situationId: meta.situationId,
    statusLabel,
    label: rel.label,
    status: rel.status,
    phase: meta.phase,
    frame,
    messages,
    debrief,
    sendMessage: meta.sendMessage ?? null,
    portrait,
  });
}
