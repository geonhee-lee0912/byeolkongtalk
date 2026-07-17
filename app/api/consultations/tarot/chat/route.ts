// 타로 풀이 채팅 — readingId 기반 컨텍스트 + Claude SSE 스트리밍 + messages INSERT.
// 사주 chat 라우트와 동일 패턴, 컨텍스트만 타로 (스프레드 + 뽑은 카드).

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildTarotSystemMessage, streamChat, computeWrapMode, computeTurnSignals } from "@/lib/claude";
import { WRAP_THRESHOLDS } from "@/lib/tarot/constants";
import { extractClosingLine } from "@/lib/saju/closing";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  detectSensitiveSync,
  detectSensitiveAsync,
  recordSensitiveAlert,
} from "@/lib/sensitive";
import { parseRecoMarker, tagNextRecoAsync, INCHAT_ONLY_PRODUCTS } from "@/lib/reco";
import type {
  SpreadType,
  SpreadCategory,
  DrawnCard,
} from "@/lib/tarot/spreads";
import { sendCapiEvent, capiSignalsFromRequest } from "@/lib/meta-capi";

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
      "id, user_id, question, consultation_type, spread_type, spread_category, emotion_tag, drawn_cards, previous_reading_id, continuation_mode, extra_turns, clarifier_count"
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

  // 호칭 (users.nickname) — 별콩이 이름 불러주기용
  const { data: userRow } = await supabase
    .from("users")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle();

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

  // 이어가기면 부모 요약(지난 고민 + 마지막 한마디) 조회
  let continuation:
    | { prevQuestion: string; prevClosing: string | null; mode: "fresh" | "deep" }
    | null = null;
  if (reading.previous_reading_id) {
    const { data: parent } = await supabase
      .from("readings")
      .select("question")
      .eq("id", reading.previous_reading_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (parent) {
      const { data: parentMsgs } = await supabase
        .from("messages")
        .select("role, content")
        .eq("reading_id", reading.previous_reading_id)
        .order("created_at", { ascending: true });
      continuation = {
        prevQuestion: parent.question ?? "",
        prevClosing: extractClosingLine(
          (parentMsgs ?? []) as { role: "user" | "assistant"; content: string }[]
        ),
        mode: (reading.continuation_mode as "fresh" | "deep") ?? "deep",
      };
    }
  }

  // 업셀 보정 임계치 — extra_turns(연장) + clarifier_count(보조 카드 1장당 +2턴/800자)
  const spreadType = reading.spread_type as SpreadType;
  const baseT = WRAP_THRESHOLDS[spreadType];
  const extraTurns = (reading.extra_turns ?? 0) as number;
  const clarifierCount = (reading.clarifier_count ?? 0) as number;
  const bonusTurns = extraTurns + clarifierCount * 2;
  const bonusChars = clarifierCount * 800;
  const effT =
    bonusTurns > 0 || bonusChars > 0
      ? {
          convergeStartTurn: baseT.convergeStartTurn + bonusTurns,
          convergeStartChars: baseT.convergeStartChars + bonusChars,
          hardCapTurn: baseT.hardCapTurn + bonusTurns,
          hardCapChars: baseT.hardCapChars + bonusChars,
          absTurnCap: baseT.absTurnCap + bonusTurns,
        }
      : undefined;

  // 대화 연장 업셀 가능: extra_turns 0 + forceEnd 아님 + EXTEND_MAX 이내 (현재 max 1)
  const extendAvailable =
    extraTurns === 0 && body.forceEnd !== true;

  // 강제 종료 턴 (마무리 버튼 or 절대 턴캡) — 모델이 [END] 빠뜨리면 서버가 보장
  const effAbsTurnCap = (effT ?? baseT).absTurnCap;
  const mustEnd =
    body.forceEnd === true || assistantTurnsSoFar + 1 >= effAbsTurnCap;

  // wrap-mode — 클라 출구 nudge 발동 기준 (X-Wrap-Mode 헤더)
  const wrapMode = computeWrapMode(
    assistantTurnsSoFar + 1,
    cumulativeAssistantChars,
    effT ?? baseT
  ).mode;

  const systemMessage = buildTarotSystemMessage({
    spreadType,
    spreadCategory: reading.spread_category as SpreadCategory,
    concernText: reading.question ?? "",
    drawnCards: (reading.drawn_cards as DrawnCard[]) ?? [],
    emotionTag: reading.emotion_tag as string | null,
    nickname: (userRow?.nickname as string | null) ?? null,
    turnSignals: computeTurnSignals(pastMessages ?? [], lastMessage.content),
    assistantTurnsSoFar,
    cumulativeAssistantChars,
    continuation,
    forceEnd: body.forceEnd === true,
    extendAvailable,
    thresholdOverride: effT,
  });

  const sensitiveSync = detectSensitiveSync(lastMessage.content);

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "X-Wrap-Mode": wrapMode,
  };
  if (sensitiveSync) {
    responseHeaders["X-Sensitive-Category"] = sensitiveSync.category;
    responseHeaders["X-Sensitive-Severity"] = String(sensitiveSync.severity);
  }

  // Anthropic API 는 role/content 외 필드를 거절함("Extra inputs are not permitted").
  // 이어하기로 불러온 메시지에 created_at 등 DB 필드가 붙어 넘어올 수 있어
  // 여기서 role/content 만 추려 방어한다 (클라이언트 stripping 의 서버측 안전망).
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

        // 빈 스트림 가드 — 텍스트 0자로 정상 종료한 턴(모델 빈 응답)을 성공으로
        // 취급해 빈 assistant 를 저장하지 않는다. catch 로 넘겨 턴 전체를 실패 처리.
        if (!assistantText.trim()) {
          throw new Error("empty_assistant_stream");
        }

        // 강제 종료 턴인데 모델이 [END] 를 빠뜨렸으면 서버가 붙여 종료를 보장
        // (마무리 버튼·절대 턴캡이 "안 눌린 것처럼" 보이는 상태 방지)
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

        // Meta CAPI 체험완료 — 이 유저의 첫 리딩이면 StartTrial. eventId=trial:{userId} 로 dedup.
        const { count: doneCount } = await supabase
          .from("readings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        if ((doneCount ?? 0) <= 1) {
          const signals = capiSignalsFromRequest(request);
          void sendCapiEvent({
            eventName: "StartTrial",
            userId,
            eventId: `trial:${userId}`,
            ...signals,
          });
        }

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

        // reco 후처리 — sensitive 턴이면 스킵 (위기 대화엔 추천 없음)
        if (!sensitiveSync) {
          const recoProduct = parseRecoMarker(assistantText);
          if (recoProduct && !INCHAT_ONLY_PRODUCTS.includes(recoProduct)) {
            // [RECO:] 마커 → 즉시 저장, 기존 next_reco 덮어쓰기 금지
            // 인챗 전용 product(tarot:clarifier, extend)는 칩 전용 — DB 저장 생략
            void supabase
              .from("readings")
              .update({
                next_reco: {
                  product: recoProduct,
                  question: null,
                  hook: null,
                  source: "marker",
                  created_at: new Date().toISOString(),
                },
              })
              .eq("id", reading.id)
              .is("next_reco", null)
              .then(({ error }) => {
                if (error) console.warn("[reco] marker UPDATE 실패:", error.message);
              });
          } else if (assistantText.includes("[END]")) {
            // [END] 있고 마커 없으면 haiku 태깅 fire-and-forget
            void (async () => {
              try {
                const { data: latest } = await supabase
                  .from("readings")
                  .select("next_reco, has_sensitive")
                  .eq("id", reading.id)
                  .maybeSingle();
                if (latest?.next_reco || latest?.has_sensitive) return;

                // 대화 텍스트 조합 (DB 메시지 + 이번 턴)
                const turns = [
                  ...(pastMessages ?? []).map(
                    (m) => `${m.role === "user" ? "user" : "assistant"}: ${m.content}`
                  ),
                  `user: ${lastMessage.content}`,
                  `assistant: ${assistantText}`,
                ];
                const convo = turns.join("\n");

                const tag = await tagNextRecoAsync(convo, "tarot");
                if (!tag) return;
                void supabase
                  .from("readings")
                  .update({
                    next_reco: {
                      ...tag,
                      source: "haiku",
                      created_at: new Date().toISOString(),
                    },
                  })
                  .eq("id", reading.id)
                  .is("next_reco", null)
                  .then(({ error }) => {
                    if (error) console.warn("[reco] haiku UPDATE 실패:", error.message);
                  });
              } catch (e) {
                console.warn("[reco] tarot END 후처리 실패 (무시):", e instanceof Error ? e.message : e);
              }
            })();
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
