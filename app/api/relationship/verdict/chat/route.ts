// app/api/relationship/verdict/chat/route.ts — 싸움 잘잘못 판정(dialogue) 채팅
// 타로 chat 라우트와 동일 SSE/rate-limit/민감 감지 골격이지만, 수렴이 훨씬 짧다 —
// WRAP_THRESHOLDS 단계 없이 고정 턴캡(VERDICT_ABS_TURN_CAP)에서 서버가 [END]를 보장.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildVerdictSystemMessage, streamChat, VERDICT_ABS_TURN_CAP } from "@/lib/claude";
import { extractClosingLine } from "@/lib/saju/closing";
import { logSkillToThread } from "@/lib/relationship/skill-log";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  resolveSensitive,
  recordSensitiveAlert,
} from "@/lib/sensitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  readingId: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LEN = 8000;

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  // Rate limit: Claude API 비용 보호 — 세션당 분당 20건 + IP당 분당 60건
  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({
    namespace: "verdict_chat_session",
    key: userId,
    max: 20,
    windowMs: 60_000,
  });
  const byIp = checkRateLimit({
    namespace: "verdict_chat_ip",
    key: ip,
    max: 60,
    windowMs: 60_000,
  });
  if (!bySession.ok || !byIp.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.readingId !== "string" || !body.readingId) {
    return NextResponse.json({ error: "readingId_required" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 });
  }
  if (body.messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "messages_too_long" }, { status: 400 });
  }
  for (const m of body.messages) {
    if (
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      m.content.length > MAX_MESSAGE_LEN
    ) {
      return NextResponse.json(
        { error: "invalid_message_format" },
        { status: 400 }
      );
    }
  }

  const lastMessage = body.messages[body.messages.length - 1];
  if (lastMessage.role !== "user") {
    return NextResponse.json({ error: "last_must_be_user" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .select("id, user_id, consultation_type, skill_key, relationship_id")
    .eq("id", body.readingId)
    .maybeSingle();

  if (rErr || !reading) {
    return NextResponse.json({ error: "reading_not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (reading.consultation_type !== "relationship" || reading.skill_key !== "verdict") {
    return NextResponse.json({ error: "not_a_verdict_reading" }, { status: 400 });
  }

  // 호칭(유저) + 상대 호칭 — 별콩이가 둘 다 이름으로 불러주기용
  const { data: userRow } = await supabase
    .from("users")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle();

  let partnerLabel: string | null = null;
  if (reading.relationship_id) {
    const { data: relRow } = await supabase
      .from("relationships")
      .select("label")
      .eq("id", reading.relationship_id)
      .maybeSingle();
    partnerLabel = (relRow?.label as string | null) ?? null;
  }

  // 누적 assistant turn 수 (마커 제외 없이 그대로 — 짧은 대화라 char 기준 불필요)
  const { data: pastMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", reading.id)
    .order("created_at", { ascending: true });

  const assistantTurnsSoFar =
    pastMessages?.filter((m) => m.role === "assistant").length ?? 0;

  // 고정 턴캡 — WRAP_THRESHOLDS 같은 단계적 수렴 없이, 이번 턴이 턴캡에 닿으면 강제 종료.
  const mustEnd = assistantTurnsSoFar + 1 >= VERDICT_ABS_TURN_CAP;

  const systemMessage = buildVerdictSystemMessage({
    nickname: (userRow?.nickname as string | null) ?? null,
    label: partnerLabel,
    assistantTurnsSoFar,
    forceEnd: mustEnd,
  });

  // sensitive 게이트 감지 — high 는 regex 즉시 확정, 회색지대는 haiku 2차 판정 후 확정(오탐 차단)
  const sensitiveMatch = await resolveSensitive(lastMessage.content);

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };
  if (sensitiveMatch) {
    responseHeaders["X-Sensitive-Category"] = sensitiveMatch.category;
    responseHeaders["X-Sensitive-Severity"] = String(sensitiveMatch.severity);
  }

  // Anthropic API 는 role/content 외 필드를 거절함 — 클라가 보낸 messages 에서 role/content 만 추림.
  const apiMessages = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(systemMessage, apiMessages)) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        // 빈 스트림 가드 — 타로 chat 라우트와 동일 패턴
        if (!assistantText.trim()) {
          throw new Error("empty_assistant_stream");
        }

        // 턴캡 도달인데 모델이 [END] 를 빠뜨렸으면 서버가 붙여 종료를 보장.
        if (mustEnd && !assistantText.includes("[END]")) {
          const tail = "\n\n[END]";
          assistantText += tail;
          controller.enqueue(encoder.encode(tail));
        }

        const turnTs = Date.now();
        await supabase.from("messages").insert([
          {
            reading_id: reading.id,
            role: "user",
            content: lastMessage.content,
            created_at: new Date(turnTs).toISOString(),
          },
          {
            reading_id: reading.id,
            role: "assistant",
            content: assistantText,
            created_at: new Date(turnTs + 1).toISOString(),
          },
        ]);

        // 판정 종료 — 관계 스레드 memo.skill_log 에 요약 적립(별콩이 기억용).
        // fire-and-forget + 자체 가드 — 실패해도 스트림에는 영향 없음.
        if (assistantText.includes("[END]") && reading.relationship_id) {
          const summary =
            extractClosingLine(
              [...(pastMessages ?? []), { role: "assistant", content: assistantText }] as {
                role: "user" | "assistant";
                content: string;
              }[]
            ) ?? "";
          void logSkillToThread(
            reading.relationship_id,
            "verdict",
            reading.id,
            summary
          ).catch((e) => {
            console.warn("[relationship] verdict skill-log 실패 (무시):", e instanceof Error ? e.message : e);
          });
        }

        // 민감 감지 — 타로 chat 라우트와 동일 패턴 (regex 1차 + 회색지대 haiku 2차)
        if (sensitiveMatch) {
          void recordSensitiveAlert({
            match: sensitiveMatch,
            userId,
            readingId: reading.id,
            messageText: lastMessage.content,
          });
          await supabase
            .from("readings")
            .update({ has_sensitive: true })
            .eq("id", reading.id);
        }

        controller.close();
      } catch (err) {
        await logError(
          err,
          ctxFromRequest(request, {
            route: "/api/relationship/verdict/chat",
            userId,
            extra: { readingId: reading.id },
          })
        );
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
