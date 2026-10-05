// 타로 풀이 채팅 — readingId 기반 컨텍스트 + Claude SSE 스트리밍 + messages INSERT.
// 사주 chat 라우트와 동일 패턴, 컨텍스트만 타로 (스프레드 + 뽑은 카드).

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildTarotSystemMessage, streamChat, computeWrapMode, computeTurnSignals } from "@/lib/claude";
import { CHAT_MODEL } from "@/lib/claude/model-registry";
import { effectiveWrapThresholds } from "@/lib/tarot/thresholds";
import { extractClosingLine } from "@/lib/saju/closing";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  resolveSensitive,
  recordSensitiveAlert,
} from "@/lib/sensitive";
import type {
  SpreadType,
  SpreadCategory,
  DrawnCard,
} from "@/lib/tarot/spreads";
import { sendCapiEvent, capiSignalsFromRequest } from "@/lib/meta-capi";
import { classifyUserTurn } from "@/lib/tarot/user-turn";
import {
  isClarifierCandidate,
  shouldKeepOpen,
  capTurnCloseBeforeAbsCap,
  finalizeAssistantText,
  createEndMarkerFilter,
} from "@/lib/tarot/inchat-offer";
import { reopenOptions, formatReopenHeader, isClarifierReopenTurn, dropEndIfPurchasedSince } from "@/lib/tarot/reopen";
import { isClarifierSyntheticMessage } from "@/lib/tarot/clarifier-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  readingId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  /** "대화 마무리" 버튼 — 별콩이 강제 마무리 + [END] */
  forceEnd?: boolean;
}

const MAX_MESSAGES = 60; // 임시 상향. 클라가 최근 40개만 전송(slice)하므로 방어 여유. 구 30은 15왕복에서 대화가 영구 차단되던 값.
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
      "id, user_id, question, consultation_type, spread_type, spread_category, emotion_tag, drawn_cards, previous_reading_id, continuation_mode, extra_turns, clarifier_count, relationship_id, skill_key, has_sensitive"
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

  // 업셀 보정 임계치 — extra_turns(연장) + clarifier_count(보조 카드 1장당 +2턴/800자). 식의 단일 원천 = lib/tarot/thresholds.ts
  const spreadType = reading.spread_type as SpreadType;
  const drawnCards = (reading.drawn_cards as DrawnCard[]) ?? [];
  const extraTurns = (reading.extra_turns ?? 0) as number;
  const clarifierCount = (reading.clarifier_count ?? 0) as number;
  const effT = effectiveWrapThresholds(spreadType, extraTurns, clarifierCount);
  if (!effT) {
    // 모르는 스프레드 — 예전엔 기본 임계치가 undefined 라 아래 어딘가에서 TypeError 로 500 이었다. 같은 실패를 명시적으로 낸다(스트림 전·DB 쓰기 전)
    return NextResponse.json({ error: "unknown_spread_type" }, { status: 500 });
  }

  // 대화 연장 업셀 가능: extra_turns 0 + forceEnd 아님 + EXTEND_MAX 이내 (현재 max 1)
  const extendAvailable =
    extraTurns === 0 && body.forceEnd !== true;

  // 강제 종료 턴 (마무리 버튼 or 절대 턴캡) — 모델이 [END] 빠뜨리거나 모양이 틀리면 서버가 보장(finalizeAssistantText)
  const effAbsTurnCap = effT.absTurnCap;
  const atAbsCap = assistantTurnsSoFar + 1 >= effAbsTurnCap;
  const mustEnd = body.forceEnd === true || atAbsCap;

  // wrap-mode — 클라 출구 nudge 발동 기준 (X-Wrap-Mode 헤더)
  const wrapMode = computeWrapMode(
    assistantTurnsSoFar + 1,
    cumulativeAssistantChars,
    effT
  ).mode;

  // sensitive 게이트 감지 — high 는 regex 즉시 확정, 회색지대(medium/low)는 haiku 2차 판정을
  // 기다려 확정(오탐이면 null). 응답 헤더 + 위기 게이트용. 빌더 전에 계산.
  const sensitiveMatch = await resolveSensitive(lastMessage.content, { userId });
  // 위기 게이트: 이번 메시지 sensitive 또는 이전 턴에서 이미 has_sensitive → 자동 종료([END]/수렴) 억제(버튼 제외)
  const crisisActive = !!sensitiveMatch || reading.has_sensitive === true;

  // 2026-10-04 인챗 결제 제안·keep-open (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-3·§3-5)
  const userTurn = classifyUserTurn(lastMessage.content);
  const signalCtx = {
    isFirstTurn: assistantTurnsSoFar === 0,
    questionLen: (reading.question ?? "").trim().length,
  };
  // 실제 wrapMode 로 먼저 계산 — keep-open 판정(⑥)이 쓰는 lastTurnEndedWithQuestion 은 과거 메시지만 보므로 wrapMode 와 무관하다
  const baseSignals = computeTurnSignals(pastMessages ?? [], lastMessage.content, { wrapMode, ...signalCtx });
  const keepOpen = shouldKeepOpen({
    wrapMode,
    mustEnd,
    crisisActive,
    userAsking: userTurn.asking,
    lastTurnEndedWithQuestion: baseSignals.lastTurnEndedWithQuestion === true,
    // 마무리 신호는 명시적 마무리어만 — 별콩이가 질문한 직후의 단독 '응/네/그래' 는 마무리가 아니라 대답이다(⑥, 사용자 결정 2026-10-04)
    userClosing: userTurn.closingExplicit,
  });

  // ⑦ 강제 종료선에서 '한 장 더'로 다시 연 직후의 카드 풀이 턴 — 모드와 무관하게 열어 두기 가이드(사용자 결정 2026-10-04).
  // 연장(③)을 산 리딩은 이 턴이 abs−1(마지막 수렴 턴)이라 유료 카드 풀이가 얇은 정리 톤을 받는다. 위기·마무리 버튼·강제 종료선엔 진다.
  // 턴 수(구매 전 강제 종료선)만으론 보조 카드를 대화 중에 일찍 산 리딩이 나중에 같은 턴 수를 지날 때도 걸리므로, 유저 말이 구매 직후
  // 클라가 보낸 synthetic 메시지일 때만 센다. '한 장 더' 후보는 clarifierCount > 0 이라 이 턴에 이미 아니다.
  const clarifierReopenTurn =
    isClarifierReopenTurn({ spreadType, extraTurns, clarifierCount, assistantTurnsSoFar }) &&
    isClarifierSyntheticMessage(lastMessage.content) &&
    !mustEnd &&
    !crisisActive;
  const keepOpenTurn = keepOpen || clarifierReopenTurn;

  // 열어 두는 턴은 대화를 이어가는 턴 — 'settle'(질문·예고 금지) 로 고정하지 않도록 free 로 다시 계산한다. 아니면 위 값 그대로.
  // 단 강제 종료 직전(abs−1)이면 질문·예고 고리 없이 정리(settle)로 끝낸다 — 다음 턴이 강제 종료라 질문(ask)·예고(invite)로 열면 유저가 따라온 뒤 곧장 작별을 받는다(마지막 수렴 턴 가이드의 "새 질문 X" 와 같은 규칙).
  // 프롬프트와 저장되는 turn_close 가 같은 값을 쓰도록 turnSignals 자체를 캡한 값으로 만든다.
  const keepOpenSignals = keepOpenTurn
    ? computeTurnSignals(pastMessages ?? [], lastMessage.content, { wrapMode: "free", ...signalCtx })
    : null;
  const turnSignals = keepOpenSignals
    ? {
        ...keepOpenSignals,
        turnClose: capTurnCloseBeforeAbsCap(keepOpenSignals.turnClose, { keepOpenTurn, assistantTurnsSoFar, effAbsTurnCap }),
      }
    : baseSignals;

  const clarifierCandidate = isClarifierCandidate({
    assistantTurnsSoFar,
    wrapMode,
    crisisActive,
    forceEnd: body.forceEnd === true,
    clarifierCount,
    pastAssistantTexts: (pastMessages ?? [])
      .filter((m) => m.role === "assistant")
      .map((m) => m.content as string),
    userAsking: userTurn.asking,
    userShortStreak: turnSignals.userShortStreak === true,
  });

  const systemMessage = buildTarotSystemMessage({
    spreadType,
    spreadCategory: reading.spread_category as SpreadCategory,
    concernText: reading.question ?? "",
    drawnCards,
    emotionTag: reading.emotion_tag as string | null,
    turnSignals,
    assistantTurnsSoFar,
    cumulativeAssistantChars,
    continuation,
    forceEnd: body.forceEnd === true,
    crisisActive,
    extendAvailable,
    thresholdOverride: effT,
    keepOpen,
    clarifierReopenTurn,
    clarifierCandidate,
  });

  // 프리미엄 첫 풀이 절단 방지 — 스트리밍 경로는 stopReason 을 버려 max_tokens 초과 시 [END]/종합 없이 조용히 잘림.
  // 7장(목표 3,900~4,800자, luna 실측 상단 ~5,900자 ≈ 3,600~3,900 tokens)은 3,600 캡에 걸려 절단됨(실측) → 5,000 상향.
  // 5·6장은 luna 실측상 3,600 tokens(≈5,900자) 내 안전. 후속 턴·소형 스프레드는 기본값. (max_tokens 는 상한 — 실제 생성분만 과금)
  const maxTokens =
    assistantTurnsSoFar === 0 && drawnCards.length >= 7
      ? 5000
      : assistantTurnsSoFar === 0 && drawnCards.length >= 5
        ? 3600
        : undefined;

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "X-Wrap-Mode": wrapMode,
  };
  if (sensitiveMatch) {
    responseHeaders["X-Sensitive-Category"] = sensitiveMatch.category;
    responseHeaders["X-Sensitive-Severity"] = String(sensitiveMatch.severity);
  }
  // 강제 종료선 턴 — 클라가 '결과 보기 →' 옆에 재개 제안을 띄울 근거 (spec §3-4).
  // 헤더는 모델 출력 전에 나가므로 보낼 수 있는 이유는 abs_cap 하나뿐이다(자연 마무리·버튼 종료는 본문이 나와야 안다 → 헤더 없음 = 재개 대상 아님).
  // 판정은 GET·구매 라우트와 같은 턴 수 기준이라 abs-cap 턴에 마무리 버튼을 눌러도 준다. 위기(자동 종료 억제)는 제외.
  // 저장본의 [END] 모양은 아래 finalizeAssistantText 가 이 약속에 맞춰 보장한다.
  if (atAbsCap && !crisisActive) {
    const ro = reopenOptions({
      endedAtAbsCap: true,
      hasSensitive: false,
      extraTurns,
      clarifierCount,
    });
    responseHeaders["X-End-Reason"] = "abs_cap";
    responseHeaders["X-Reopen"] = formatReopenHeader(ro);
  }

  // Anthropic API 는 role/content 외 필드를 거절함("Extra inputs are not permitted").
  // 이어하기로 불러온 메시지에 created_at 등 DB 필드가 붙어 넘어올 수 있어
  // 여기서 role/content 만 추려 방어한다 (클라이언트 stripping 의 서버측 안전망).
  const apiMessages = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  let assistantText = ""; // 화면에 나간(스트림으로 보낸) 글자 — 저장본(saved)은 정규화로 이와 다를 수 있다
  let rawChars = 0; // 모델이 보낸 글자 수(필터 통과 전) — keep-open 필터가 [END] 만 지워 빈 응답이 된 턴을 로그에서 구분하는 용도
  let endFiltered = false;
  const endFilter = keepOpenTurn ? createEndMarkerFilter() : null; // 열어 두는 턴(keep-open · ⑦ 재개 직후 카드 풀이) 전용 — 이 턴엔 [END] 가 전송·저장 어디에도 남지 않게 스트림에서 지운다(spec §3-3)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(systemMessage, apiMessages, maxTokens, {
          route: "/api/consultations/tarot/chat",
          userId,
          extra: { readingId: reading.id },
        }, CHAT_MODEL)) {
          rawChars += chunk.length;
          const out = endFilter ? endFilter.push(chunk) : chunk;
          if (!out) continue;
          assistantText += out;
          controller.enqueue(encoder.encode(out));
        }
        if (endFilter) {
          const rest = endFilter.flush();
          if (rest) {
            assistantText += rest;
            controller.enqueue(encoder.encode(rest));
          }
        }

        // 빈 스트림 가드 — 텍스트 0자로 정상 종료한 턴(모델 빈 응답)을 성공으로
        // 취급해 빈 assistant 를 저장하지 않는다. catch 로 넘겨 턴 전체를 실패 처리.
        if (!assistantText.trim()) {
          // 필터가 지운 글자가 있으면 [END] 만 남았던 응답(모델이 닫으려던 keep-open 턴)이다 — 모델의 진짜 빈 응답과 로그(extra.endFiltered)에서 구분
          endFiltered = rawChars > assistantText.length;
          throw new Error("empty_assistant_stream");
        }

        // 응답 끝처리 — 강제 종료 턴은 [END] 가 정확히 하나·맨 끝이 되게(재개 버튼이 저장본의 이 모양에 달렸다 — spec §3-4),
        // '한 장 더' 후보 턴은 마커 누락 수리(§3-5 ③). 위기로 자동 종료가 억제된 턴(버튼 제외)은 건드리지 않는다(§위기 [END]금지 코드 강제 3d).
        // 스트림은 이미 나간 글자를 못 바꾸니 꼬리만 보내고, 저장본은 정규화로 스트림과 달라질 수 있다(중복·소문자·본문 중간 [END] — 클라는 이미 종료 마커를 받았다).
        const { saved, streamTail } = finalizeAssistantText(assistantText, {
          mustEnd,
          crisisActive,
          forceEnd: body.forceEnd === true,
          clarifierCandidate,
        });
        if (streamTail) {
          assistantText += streamTail;
          controller.enqueue(encoder.encode(streamTail));
        }

        // 다른 탭 경합(spec §7) — 닫는 턴이면 저장 직전에 구매 횟수를 다시 읽는다. 스트림 도중 다른 탭에서 재개 상품을 샀으면 [END] 를 저장하지 않는다.
        // 마무리 버튼 턴도 같다 — 산 턴이 우선이고 결과 화면은 [END] 없는 리딩에 '이어서 대화하기'를 보여 준다(사용자 결정 2026-10-05) · 재조회가 실패하면 종전대로 저장한다
        let toSave = saved;
        if (/\[END\]/i.test(saved)) {
          const { data: now } = await supabase
            .from("readings")
            .select("extra_turns, clarifier_count")
            .eq("id", reading.id)
            .maybeSingle();
          if (now) {
            toSave = dropEndIfPurchasedSince(
              saved,
              { extraTurns, clarifierCount },
              { extraTurns: now.extra_turns ?? 0, clarifierCount: now.clarifier_count ?? 0 },
            );
          }
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
            content: toSave,
            turn_close: turnSignals.turnClose ?? null,
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
            route: "/api/consultations/tarot/chat",
            userId,
            // 유저가 겪은 것: partialCharsShown=이 턴에 화면에 보인 별콩이 글자수
            // (0=로딩 점만 보다 "연결이 흔들렸어" 배너 + 답 없음, >0=답이 이만큼 나오다 끊김).
            // 두 경우 모두 이 턴은 DB 미저장(유저·별콩이 메시지 통째 유실) → 유저가 재전송해야 함.
            extra: {
              readingId: reading.id,
              assistantTurnsSoFar,
              partialCharsShown: assistantText.length,
              // keep-open 필터가 [END] 만 지워 응답이 빈 경우(모델이 닫으려던 턴) — 모델의 진짜 빈 응답과 구분
              ...(endFiltered ? { endFiltered: true } : {}),
            },
          })
        );
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
