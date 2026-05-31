// 타로 풀이 채팅 — readingId 기반 컨텍스트 + Claude SSE 스트리밍 + messages INSERT.
// 사주 chat 라우트와 동일 패턴, 컨텍스트만 타로 (스프레드 + 뽑은 카드).

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildTarotSystemMessage, streamChat } from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  detectSensitiveSync,
  detectSensitiveAsync,
  recordSensitiveAlert,
} from "@/lib/sensitive";
import type {
  SpreadType,
  SpreadCategory,
  DrawnCard,
} from "@/lib/tarot/spreads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  readingId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  /** "대화 마무리" 버튼 — 별콩이 강제 마무리 + [END] */
  forceEnd?: boolean;
}

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LEN = 8000;
// 누적 글자수 계산 시 마커 제외
const MARKER_REGEX = /\[CARD:\d+\]|\[END\]/g;

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  // Rate limit: Claude API 비용 보호 — 세션당 분당 20건 + IP당 분당 60건
  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({
    namespace: "tarot_chat_session",
    key: userId,
    max: 20,
    windowMs: 60_000,
  });
  const byIp = checkRateLimit({
    namespace: "tarot_chat_ip",
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
    .select(
      "id, user_id, question, consultation_type, spread_type, spread_category, emotion_tag, drawn_cards"
    )
    .eq("id", body.readingId)
    .maybeSingle();

  if (rErr || !reading) {
    return NextResponse.json({ error: "reading_not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (reading.consultation_type !== "tarot") {
    return NextResponse.json({ error: "not_a_tarot_reading" }, { status: 400 });
  }

  // 누적 assistant turn 수 + chars 계산 (마커 제외)
  const { data: pastMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", reading.id)
    .order("created_at", { ascending: true });

  const assistantTurnsSoFar =
    pastMessages?.filter((m) => m.role === "assistant").length ?? 0;
  const cumulativeAssistantChars =
    pastMessages?.reduce(
      (acc, m) =>
        m.role === "assistant"
          ? acc + m.content.replace(MARKER_REGEX, "").length
          : acc,
      0
    ) ?? 0;

  const systemMessage = buildTarotSystemMessage({
    spreadType: reading.spread_type as SpreadType,
    spreadCategory: reading.spread_category as SpreadCategory,
    concernText: reading.question ?? "",
    drawnCards: (reading.drawn_cards as DrawnCard[]) ?? [],
    emotionTag: reading.emotion_tag as string | null,
    assistantTurnsSoFar,
    cumulativeAssistantChars,
    forceEnd: body.forceEnd === true,
  });

  const sensitiveSync = detectSensitiveSync(lastMessage.content);

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };
  if (sensitiveSync) {
    responseHeaders["X-Sensitive-Category"] = sensitiveSync.category;
    responseHeaders["X-Sensitive-Severity"] = String(sensitiveSync.severity);
  }

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(systemMessage, body.messages)) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        await supabase.from("messages").insert([
          { reading_id: reading.id, role: "user", content: lastMessage.content },
          { reading_id: reading.id, role: "assistant", content: assistantText },
        ]);

        if (sensitiveSync) {
          void recordSensitiveAlert({
            match: sensitiveSync,
            userId,
            readingId: reading.id,
            messageText: lastMessage.content,
          });
          await supabase
            .from("readings")
            .update({ has_sensitive: true })
            .eq("id", reading.id);

          if (sensitiveSync.certainty !== "high") {
            void detectSensitiveAsync(lastMessage.content).then((m) => {
              if (m && m.method !== "regex") {
                void recordSensitiveAlert({
                  match: m,
                  userId,
                  readingId: reading.id,
                  messageText: lastMessage.content,
                });
              }
            });
          }
        }

        controller.close();
      } catch (err) {
        await logError(
          err,
          ctxFromRequest(request, {
            route: "/api/consultations/tarot/chat",
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
