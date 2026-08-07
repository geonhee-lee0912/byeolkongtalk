// app/api/relationship/sim/chat/route.ts — 3화자 SSE. say(인형)·note(별콩이 노트) + 민감 게이트 + 디브리핑(T10).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { streamChat, generateOnce, buildDollSystemMessage, buildSimByeolkongMessage } from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import { resolveSensitive, recordSensitiveAlert } from "@/lib/sensitive";
import { splitThreadMessages, type ThreadMsg } from "@/lib/relationship/memory";
import { RELATIONSHIP_STATUS_LABELS, type RelationshipStatus } from "@/lib/relationship/types";
import { getSituation } from "@/lib/relationship/situations";
import {
  shouldAutoNote, shouldSuggestWrap, simForceDebrief, extractSendLine, stripSimMarkers,
  buildSimContextBlock, formatPartnerForDoll, type SimMeta,
} from "@/lib/relationship/sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_MESSAGE_LEN = 8000;
const DOLL_MAX_TOKENS = 700;   // 인형 대사는 짧은 채팅 — 초기값(QA 튜닝)
const NOTE_MAX_TOKENS = 800;   // 별콩이 노트
const DEBRIEF_MAX_TOKENS = 1400;

type Action = "say" | "note" | "debrief";
interface Body { simReadingId: string; message?: string; action?: Action }

/** 판 로드 + 소유권 + 상황/관계/프로필 컨텍스트를 한 번에 준비. */
async function loadSim(userId: string, simReadingId: string) {
  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("id, user_id, relationship_id, consultation_type, saju_data, has_sensitive")
    .eq("id", simReadingId)
    .maybeSingle();
  if (!reading || reading.user_id !== userId || reading.consultation_type !== "relationship_sim") return null;
  const meta = (reading.saju_data ?? {}) as SimMeta;
  const situation = getSituation(meta.situationId);
  if (!situation) return null;
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, label, status, partner_profile_id")
    .eq("id", reading.relationship_id)
    .maybeSingle();
  if (!rel) return null;
  let mbti: string | null = null, personality: string | null = null;
  if (rel.partner_profile_id) {
    const { data: p } = await supabase
      .from("user_profiles").select("mbti, personality").eq("id", rel.partner_profile_id).eq("user_id", userId).maybeSingle();
    mbti = p?.mbti ?? null; personality = p?.personality ?? null;
  }
  const statusLabel = RELATIONSHIP_STATUS_LABELS[rel.status as RelationshipStatus] ?? rel.status;
  return { supabase, reading, meta, situation, rel, statusLabel, mbti, personality };
}

/** 인형 대화(skill_key IS NULL)만 오름차순으로 — 인형 호출용 교대 메시지 / 노트·디브리핑 컨텍스트. */
async function loadDollConversation(supabase: ReturnType<typeof getServiceSupabase>, simReadingId: string): Promise<ThreadMsg[]> {
  const { data } = await supabase
    .from("messages").select("role, content").eq("reading_id", simReadingId).is("skill_key", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as ThreadMsg[];
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({ namespace: "sim_chat_session", key: userId, max: 20, windowMs: 60_000 });
  const byIp = checkRateLimit({ namespace: "sim_chat_ip", key: ip, max: 60, windowMs: 60_000 });
  if (!bySession.ok || !byIp.ok)
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });

  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.simReadingId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const loaded = await loadSim(userId, body.simReadingId);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { supabase, reading, meta, situation, rel, statusLabel, mbti, personality } = loaded;
  if (meta.phase === "debriefed") return NextResponse.json({ error: "sim_done" }, { status: 409 });

  const action: Action = body.action ?? "say";
  const encoder = new TextEncoder();
  const logCtx = { route: "/api/relationship/sim/chat", userId, extra: { simReadingId: reading.id, action } };

  // ── note (온디맨드 💭 / 자동): 별콩이 노트 — 인형 대화 컨텍스트를 텍스트로 주입, 별도 호출 ──
  // [소프트 수렴 델타] 인형 유저턴 수로 shouldSuggestWrap 판정 → 후반부면 정리 유도 힌트.
  if (action === "note") {
    const convo = await loadDollConversation(supabase, reading.id);
    const dollTurns = convo.filter((m) => m.role === "user").length;
    const system = buildSimByeolkongMessage({
      mode: "note", situation, partnerName: rel.label, statusLabel,
      userContext: meta.userContext, convoBlock: buildSimContextBlock(convo),
      suggestWrap: shouldSuggestWrap(dollTurns),
    });
    return streamAndSave(supabase, encoder, system, [{ role: "user", content: "지금 무대를 보고 노트를 남겨줘." }],
      NOTE_MAX_TOKENS, reading.id, "sim_note", logCtx, request, userId);
  }

  // ── debrief (정리하기 / 턴캡 강제): 별콩이 복귀 → 3블록 → 보낼 말 추출 → 메타 저장. 멱등. ──
  if (action === "debrief") {
    const convo = await loadDollConversation(supabase, reading.id);
    const system = buildSimByeolkongMessage({
      mode: "debrief", situation, partnerName: rel.label, statusLabel,
      userContext: meta.userContext, convoBlock: buildSimContextBlock(convo),
    });
    let raw: string;
    try {
      raw = await generateOnce(system, [{ role: "user", content: "이제 인형을 내려놓고 정리해줘." }], DEBRIEF_MAX_TOKENS, logCtx);
    } catch (err) {
      await logError(err, ctxFromRequest(request, { ...logCtx, extra: { ...logCtx.extra, stage: "debrief_generate" } }));
      return NextResponse.json({ error: "debrief_failed" }, { status: 500 });
    }
    if (!raw.trim())
      return NextResponse.json({ error: "debrief_empty" }, { status: 500 });

    const sendMessage = extractSendLine(raw);
    const display = stripSimMarkers(raw);
    const nowIso = new Date().toISOString();
    const nextMeta: SimMeta = { ...meta, phase: "debriefed", sendMessage: sendMessage ?? undefined };
    // 디브리핑 메시지 저장(skill_key='sim_debrief') + 판 메타 갱신(phase·sendMessage) — best-effort.
    // 저장이 실패해도 이미 생성된 디브리핑은 유저에게 반환한다(유료 판 디브리핑 유실 > 저장 실패, 플랜 §6).
    try {
      const { error: mErr } = await supabase.from("messages").insert([
        { reading_id: reading.id, role: "assistant", content: display, skill_key: "sim_debrief", created_at: nowIso },
      ]);
      const { error: uErr } = await supabase.from("readings").update({ saju_data: nextMeta }).eq("id", reading.id);
      if (mErr || uErr)
        await logError(mErr ?? uErr ?? new Error("debrief_save_failed"),
          ctxFromRequest(request, { ...logCtx, extra: { ...logCtx.extra, stage: "debrief_save" } }));
    } catch (err) {
      await logError(err, ctxFromRequest(request, { ...logCtx, extra: { ...logCtx.extra, stage: "debrief_save" } }));
    }

    return NextResponse.json({ debrief: display, sendMessage, situationId: situation.id, success: true });
  }

  // ── say (인형 대사) ──
  if (typeof body.message !== "string" || body.message.length < 1 || body.message.length > MAX_MESSAGE_LEN)
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const userMessage: string = body.message;

  // 민감 게이트 — high 는 regex 즉시, 회색지대는 haiku 2차(await). 감지되면 인형 내려놓고 별콩이 복귀+hotline.
  const sensitive = await resolveSensitive(userMessage);
  if (sensitive) {
    void recordSensitiveAlert({ match: sensitive, userId, readingId: reading.id, messageText: userMessage });
    await supabase.from("readings").update({ has_sensitive: true }).eq("id", reading.id);
    // 민감 턴은 인형 호출 안 함 — 별콩이(코어 위기) 복귀. user+별콩이 모두 skill_key='sim_note'(인형 교대·턴캡 오염 방지).
    await supabase.from("messages").insert([{ reading_id: reading.id, role: "user", content: userMessage, skill_key: "sim_note" }]);
    const convo = await loadDollConversation(supabase, reading.id);
    const system = buildSimByeolkongMessage({
      mode: "crisis", situation, partnerName: rel.label, statusLabel,
      userContext: meta.userContext, convoBlock: buildSimContextBlock(convo),
    });
    return streamAndSave(supabase, encoder, system, [{ role: "user", content: userMessage }],
      NOTE_MAX_TOKENS, reading.id, "sim_note", logCtx, request, userId,
      { "X-Sim-Sensitive": "1", "X-Sensitive-Category": sensitive.category, "X-Sensitive-Severity": String(sensitive.severity) });
  }

  // 턴캡 하드 게이트 — 위기 판이 아니면 SIM_TURN_CAP 도달 시 추가 인형 턴 거부 → 디브리핑 요구.
  const priorConvo = await loadDollConversation(supabase, reading.id);
  const priorDollTurns = priorConvo.filter((m) => m.role === "user").length;
  if (simForceDebrief({ dollTurns: priorDollTurns, hasSensitive: reading.has_sensitive })) {
    return NextResponse.json({ error: "sim_turn_cap", code: "SIM_TURN_CAP" }, { status: 409, headers: { "X-Sim-Force-Debrief": "1" } });
  }

  // 인형 호출 — doll_partner + 상황 seed + 프로필 + 유저맥락. 교대 메시지는 인형 대화(user-start 보장) + 이번 발화.
  const split = splitThreadMessages([...priorConvo, { role: "user", content: userMessage }], 0);
  const system = buildDollSystemMessage({
    situation, partnerName: rel.label, statusLabel,
    profileLine: formatPartnerForDoll({ statusLabel, mbti, personality }), userContext: meta.userContext,
  });

  const nextDollTurns = priorDollTurns + 1;
  const respHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    "X-Sim-Turn": String(nextDollTurns),
  };
  if (shouldAutoNote(nextDollTurns)) respHeaders["X-Sim-Autonote"] = "1";
  if (simForceDebrief({ dollTurns: nextDollTurns, hasSensitive: reading.has_sensitive })) respHeaders["X-Sim-Force-Debrief"] = "1";

  let dollText = "";
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(system, split.apiMessages, DOLL_MAX_TOKENS, logCtx)) {
          dollText += chunk; controller.enqueue(encoder.encode(chunk));
        }
        if (!dollText.trim()) throw new Error("empty_doll_stream");
        const ts = Date.now();
        await supabase.from("messages").insert([
          { reading_id: reading.id, role: "user", content: userMessage, skill_key: null, created_at: new Date(ts).toISOString() },
          { reading_id: reading.id, role: "assistant", content: dollText, skill_key: null, created_at: new Date(ts + 1).toISOString() },
        ]);
        controller.close();
      } catch (err) {
        await logError(err, ctxFromRequest(request, { ...logCtx, extra: { ...logCtx.extra, partialCharsShown: dollText.length } }));
        controller.error(err);
      }
    },
  });
  return new Response(stream, { headers: respHeaders });
}

/** 별콩이 계열(note·crisis) 스트림 + skill_key 저장 공용. 저장 실패까지 controller.error 로 마무리. */
function streamAndSave(
  supabase: ReturnType<typeof getServiceSupabase>,
  encoder: TextEncoder,
  system: { staticPart: string; dynamicPart: string },
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number,
  simReadingId: string,
  skillKey: string,
  logCtx: { route: string; userId: string; extra: Record<string, unknown> },
  request: NextRequest,
  _userId: string,
  extraHeaders?: Record<string, string>
): Response {
  let text = "";
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(system, messages, maxTokens, logCtx)) {
          text += chunk; controller.enqueue(encoder.encode(chunk));
        }
        if (!text.trim()) throw new Error("empty_byeolkong_stream");
        await supabase.from("messages").insert([{ reading_id: simReadingId, role: "assistant", content: text, skill_key: skillKey }]);
        controller.close();
      } catch (err) {
        await logError(err, ctxFromRequest(request, { ...logCtx, extra: { ...logCtx.extra, partialCharsShown: text.length } }));
        controller.error(err);
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", ...(extraHeaders ?? {}) },
  });
}
