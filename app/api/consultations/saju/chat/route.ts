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
import { buildSystemMessage, streamChat, computeWrapMode, computeTurnSignals } from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  detectSensitiveSync,
  detectSensitiveAsync,
  recordSensitiveAlert,
} from "@/lib/sensitive";
import { parseRecoMarker, tagNextRecoAsync, INCHAT_ONLY_PRODUCTS } from "@/lib/reco";
import type { SajuResult } from "@/lib/saju/calc";
import { isSajuProduct } from "@/lib/saju/products";
import {
  CONVERGE_START_TURN,
  CONVERGE_START_CHARS,
  HARD_CAP_TURN,
  HARD_CAP_CHARS,
  ABS_TURN_CAP,
} from "@/lib/saju/constants";
import { extractClosingLine } from "@/lib/saju/closing";
import { sendCapiEvent, capiSignalsFromRequest } from "@/lib/meta-capi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  readingId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  /** "대화 마무리" 버튼 — 이번 턴 그레이스풀 종료([END]) 강제 */
  forceEnd?: boolean;
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
    .select("id, user_id, question, saju_data, emotion_tag, saju_product, previous_reading_id, continuation_mode, extra_turns, has_sensitive")
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

  // 호칭 (users.nickname) — 별콩이 이름 불러주기용
  const { data: userRow } = await supabase
    .from("users")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle();

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

  // 업셀 보정 임계치 — extra_turns(연장) 반영 (사주엔 clarifier 없음)
  const extraTurns = (reading.extra_turns ?? 0) as number;
  const thresholdOverride =
    extraTurns > 0
      ? {
          convergeStartTurn: CONVERGE_START_TURN + extraTurns,
          convergeStartChars: CONVERGE_START_CHARS,
          hardCapTurn: HARD_CAP_TURN + extraTurns,
          hardCapChars: HARD_CAP_CHARS,
          absTurnCap: ABS_TURN_CAP + extraTurns,
        }
      : undefined;

  // 대화 연장 업셀 가능: extra_turns 0 + forceEnd 아님
  const extendAvailable = extraTurns === 0 && body.forceEnd !== true;

  // 강제 종료 턴 (마무리 버튼 or 절대 턴캡) — 모델이 [END] 빠뜨리면 서버가 보장
  const effAbsTurnCap = thresholdOverride?.absTurnCap ?? ABS_TURN_CAP;
  const mustEnd =
    body.forceEnd === true || assistantTurnsSoFar + 1 >= effAbsTurnCap;

  // wrap-mode — 클라 출구 nudge 발동 기준 (X-Wrap-Mode 헤더)
  const wrapMode = computeWrapMode(
    assistantTurnsSoFar + 1,
    cumulativeAssistantChars,
    {
      convergeStartTurn: thresholdOverride?.convergeStartTurn ?? CONVERGE_START_TURN,
      convergeStartChars: thresholdOverride?.convergeStartChars ?? CONVERGE_START_CHARS,
      hardCapTurn: thresholdOverride?.hardCapTurn ?? HARD_CAP_TURN,
      hardCapChars: thresholdOverride?.hardCapChars ?? HARD_CAP_CHARS,
      absTurnCap: effAbsTurnCap,
    }
  ).mode;

  // sensitive 1차 감지 (regex ~1ms) — 응답 헤더 + 위기 게이트용. 빌더 전에 계산.
  const sensitiveSync = detectSensitiveSync(lastMessage.content);
  // 위기 게이트: 이번 메시지 sensitive 또는 이전 턴에서 이미 has_sensitive → 자동 종료([END]/수렴) 억제(버튼 제외)
  const crisisActive = !!sensitiveSync || reading.has_sensitive === true;

  const systemMessage = buildSystemMessage({
    saju: reading.saju_data as SajuResult,
    sajuProduct: isSajuProduct(reading.saju_product)
      ? reading.saju_product
      : "today_letters",
    concernText: reading.question ?? "",
    emotionTag: reading.emotion_tag as string | null,
    nickname: (userRow?.nickname as string | null) ?? null,
    turnSignals: computeTurnSignals(pastMessages ?? [], lastMessage.content),
    assistantTurnsSoFar,
    cumulativeAssistantChars,
    forceEnd: body.forceEnd === true,
    crisisActive,
    continuation,
    extendAvailable,
    thresholdOverride,
  });

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

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(systemMessage, body.messages)) {
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
        // 단, 위기 대화(버튼 아님)면 자동 [END] 강제 주입을 억제 — §위기 [END]금지 코드 강제(3d)
        if (mustEnd && !(crisisActive && body.forceEnd !== true) && !assistantText.includes("[END]")) {
          const tail = "\n\n[END]";
          assistantText += tail;
          controller.enqueue(encoder.encode(tail));
        }

        // 스트림 완료 — user 마지막 메시지 + assistant 응답 둘 다 INSERT
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

                const tag = await tagNextRecoAsync(convo, "saju");
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
                console.warn("[reco] saju END 후처리 실패 (무시):", e instanceof Error ? e.message : e);
              }
            })();
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
