// app/api/relationship/chat/route.ts — "우리 사이" 지속 스레드 채팅 (패스 게이트 + 소프트캡 + 기억 + SSE)
// 타로 chat 라우트와 동일 SSE/rate-limit/민감 감지 골격이지만, 수렴(wrap)·[END] 없음 — 대신
// 패스 유무 게이트 + 일일 소프트캡 톤 전환 + 최근창/임계요약 기억 주입 + [CHECKIN:] 파싱.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildRelationshipSystemMessage, streamChat, summarizeOlder, computeTurnSignals } from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  resolveSensitive,
  recordSensitiveAlert,
} from "@/lib/sensitive";
import { getActivePass, getTodayThreadTurns, getTodayExtendCount } from "@/lib/relationship/passes";
import {
  dailyTurnAllowance,
  type RelationshipMemo,
  type RelationshipStatus,
} from "@/lib/relationship/types";
import {
  splitThreadMessages,
  buildRelationshipFileBlock,
  type ThreadMsg,
} from "@/lib/relationship/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LEN = 8000;
const CHECKIN_RE = /\[CHECKIN:([^\]]+)\]/;

interface Body {
  relationshipId: string;
  message: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  // Rate limit: Claude API 비용 보호 — 세션당 분당 20건 + IP당 분당 60건
  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({
    namespace: "rel_chat_session",
    key: userId,
    max: 20,
    windowMs: 60_000,
  });
  const byIp = checkRateLimit({
    namespace: "rel_chat_ip",
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    !body.relationshipId ||
    typeof body.message !== "string" ||
    body.message.length < 1 ||
    body.message.length > MAX_MESSAGE_LEN
  ) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select(
      "id, user_id, label, status, self_profile_id, partner_profile_id, thread_reading_id, rolling_summary, summarized_msg_count, memo, last_visited_at"
    )
    .eq("id", body.relationshipId)
    .maybeSingle();
  if (!rel || rel.user_id !== userId || !rel.thread_reading_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 패스 게이트 — 활성 패스 없으면 대화 불가(구매 유도, 클라가 402로 PassPanel 노출)
  const pass = await getActivePass(rel.id);
  if (!pass) {
    return NextResponse.json({ error: "pass_required" }, { status: 402 });
  }

  // 일일 소프트캡 — 도달 시 이번 턴은 하루 마무리 톤(그래도 응답은 함, 클라가 다음 입력을 잠금)
  const [todayTurns, todayExtend] = await Promise.all([
    getTodayThreadTurns(rel.thread_reading_id),
    getTodayExtendCount(userId),
  ]);
  const dailyClose = todayTurns >= dailyTurnAllowance(todayExtend);

  // 누적 메시지(오름차순) → 최근창/요약델타 분할
  const { data: pastRows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", rel.thread_reading_id)
    .order("created_at", { ascending: true });
  const past = (pastRows ?? []) as ThreadMsg[];
  const isFirstEver = past.length === 0;
  const split = splitThreadMessages(
    [...past, { role: "user", content: body.message }],
    rel.summarized_msg_count ?? 0
  );

  const fileBlock = buildRelationshipFileBlock(
    {
      label: rel.label,
      status: rel.status as RelationshipStatus,
      hasSelfBirth: !!rel.self_profile_id,
      hasPartnerBirth: !!rel.partner_profile_id,
      memo: (rel.memo ?? {}) as RelationshipMemo,
    },
    rel.rolling_summary
  );

  // 호칭 (users.nickname) — 별콩이 이름 불러주기용
  const { data: userRow } = await supabase
    .from("users")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle();

  // 복귀 안부 — pending 처방이 있고 마지막 방문에서 6h+ 지났으면 이번 턴 별콩이가 먼저 안부 (T17)
  const CHECKIN_GAP_MS = 6 * 60 * 60 * 1000;
  const memoNow = (rel.memo ?? {}) as RelationshipMemo;
  const lastVisit = rel.last_visited_at
    ? new Date(rel.last_visited_at as string).getTime()
    : 0;
  const checkinPrompt =
    memoNow.pending_checkin && Date.now() - lastVisit > CHECKIN_GAP_MS
      ? memoNow.pending_checkin.text
      : null;

  const systemMessage = buildRelationshipSystemMessage({
    fileBlock,
    nickname: (userRow?.nickname as string | null) ?? null,
    isFirstEver,
    checkinPrompt,
    dailyClose,
    turnSignals: computeTurnSignals(past, body.message),
  });

  // sensitive 게이트 감지 — high 는 regex 즉시 확정, 회색지대는 haiku 2차 판정 후 확정(오탐 차단)
  const sensitiveMatch = await resolveSensitive(body.message);

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "X-Daily-Cap": dailyClose ? "reached" : "ok",
  };
  if (sensitiveMatch) {
    responseHeaders["X-Sensitive-Category"] = sensitiveMatch.category;
    responseHeaders["X-Sensitive-Severity"] = String(sensitiveMatch.severity);
  }

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(systemMessage, split.apiMessages, 1400)) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        // 빈 스트림 가드 — 타로 chat 라우트와 동일 패턴 (빈 assistant 를 저장하지 않고 실패 처리)
        if (!assistantText.trim()) {
          throw new Error("empty_assistant_stream");
        }

        const turnTs = Date.now();
        await supabase.from("messages").insert([
          {
            reading_id: rel.thread_reading_id,
            role: "user",
            content: body.message,
            created_at: new Date(turnTs).toISOString(),
          },
          {
            reading_id: rel.thread_reading_id,
            role: "assistant",
            content: assistantText,
            created_at: new Date(turnTs + 1).toISOString(),
          },
        ]);

        // last_visited_at 갱신 + 복귀 안부 소진 + [CHECKIN:] 신규 파싱
        const memo = (rel.memo ?? {}) as RelationshipMemo;
        // 이번 턴이 복귀 안부였으면(주입됨) pending 소진 → prescriptions 에 resolved 로 이동
        if (checkinPrompt && memo.pending_checkin) {
          memo.prescriptions = [
            ...(memo.prescriptions ?? []),
            {
              text: memo.pending_checkin.text,
              created_at: memo.pending_checkin.created_at,
              resolved_at: new Date().toISOString(),
            },
          ].slice(-30);
          memo.pending_checkin = null;
        }
        // 이번 응답에 새 [CHECKIN:] 이 있으면 다음 방문 안부 소재로 세팅 (소진 뒤에 세팅)
        const checkin = assistantText.match(CHECKIN_RE);
        if (checkin) {
          memo.pending_checkin = {
            text: checkin[1].trim(),
            created_at: new Date().toISOString(),
          };
        }
        await supabase
          .from("relationships")
          .update({ last_visited_at: new Date().toISOString(), memo })
          .eq("id", rel.id);

        // 임계 요약 (fire-and-forget) — older 델타가 SUMMARY_TRIGGER 이상 쌓였을 때만 haiku 호출
        if (split.toSummarize.length > 0) {
          void summarizeOlder(rel.rolling_summary, split.toSummarize)
            .then((sum) =>
              supabase
                .from("relationships")
                .update({
                  rolling_summary: sum,
                  summarized_msg_count: split.newSummarizedCount,
                })
                .eq("id", rel.id)
            )
            .catch((e) => console.warn("[rel] summarize 실패:", e));
        }

        // 민감 감지 — 타로 chat 라우트와 동일 패턴 (regex 1차 + 회색지대 haiku 2차)
        if (sensitiveMatch) {
          void recordSensitiveAlert({
            match: sensitiveMatch,
            userId,
            readingId: rel.thread_reading_id,
            messageText: body.message,
          });
          await supabase
            .from("readings")
            .update({ has_sensitive: true })
            .eq("id", rel.thread_reading_id);
        }

        controller.close();
      } catch (err) {
        await logError(
          err,
          ctxFromRequest(request, {
            route: "/api/relationship/chat",
            userId,
            extra: { relationshipId: rel.id },
          })
        );
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
