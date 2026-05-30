// 사주 풀이 채팅 — readingId 기반 컨텍스트 + Claude SSE 스트리밍 + messages INSERT.
//
// Phase 5 (e) 통합: 사용자 메시지 진입 시 detectSensitiveSync → 응답 헤더로
//   X-Sensitive-Category / Severity 박고 sensitive_alerts INSERT + readings.has_sensitive=true.
//   회색지대(certainty low) 면 Claude haiku 2차 분류 fire-and-forget.
//
// Rate limit: 세션당 분당 20건 + IP당 분당 60건 (Claude API 비용 보호).
//
// 흐름:
//   1. 세션 + body 검증 (readingId + messages)
//   2. readings 조회 + 소유권 (user_id 매칭)
//   3. 사용자 마지막 메시지 sensitive 1차 감지 + 응답 헤더
//   4. messages 테이블에서 누적 assistant turn 수 + chars 계산
//   5. buildSystemMessage(saju + concern + 턴 메타) → streamChat
//   6. SSE response stream — chunk 받을 때마다 client 에 enqueue + 누적
//   7. stream 완료 시 user/assistant 메시지 INSERT + sensitive 후처리 (DB INSERT + Claude 2차)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildSystemMessage, streamChat } from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  detectSensitiveSync,
  detectSensitiveAsync,
  recordSensitiveAlert,
} from "@/lib/sensitive";
import type { SajuResult } from "@/lib/saju/calc";

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
    namespace: "saju_chat_session",
    key: userId,
    max: 20,
    windowMs: 60_000,
  });
  const byIp = checkRateLimit({
    namespace: "saju_chat_ip",
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

  // 마지막 메시지는 user 여야 함 (assistant 응답을 받기 위함)
  const lastMessage = body.messages[body.messages.length - 1];
  if (lastMessage.role !== "user") {
    return NextResponse.json({ error: "last_must_be_user" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // readings 조회 + 소유권 확인
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .select("id, user_id, question, saju_data, emotion_tag")
    .eq("id", body.readingId)
    .maybeSingle();

  if (rErr || !reading) {
    return NextResponse.json(
      { error: "reading_not_found" },
      { status: 404 }
    );
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // 누적 assistant turn 수 + chars 계산 (DB 의 messages 기준)
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
          ? acc + m.content.replace(/\[END\]\s*$/, "").length
          : acc,
      0
    ) ?? 0;

  const systemMessage = buildSystemMessage({
    saju: reading.saju_data as SajuResult,
    concernText: reading.question ?? "",
    emotionTag: reading.emotion_tag as string | null,
    assistantTurnsSoFar,
    cumulativeAssistantChars,
  });

  // sensitive 1차 감지 (regex ~1ms, 응답 헤더용)
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

        // 스트림 완료 — user 마지막 메시지 + assistant 응답 둘 다 INSERT
        await supabase.from("messages").insert([
          {
            reading_id: reading.id,
            role: "user",
            content: lastMessage.content,
          },
          {
            reading_id: reading.id,
            role: "assistant",
            content: assistantText,
          },
        ]);

        // sensitive 후처리 (스트림 끝난 뒤 비동기 — 클라 응답 지연 X)
        if (sensitiveSync) {
          // 1차 매칭은 즉시 기록
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

          // 회색지대면 Claude 2차 분류 fire-and-forget — false positive 정리용 (regex high 면 skip)
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
            route: "/api/consultations/saju/chat",
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
