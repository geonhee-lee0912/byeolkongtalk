// app/api/relationship/chat/route.ts — "우리 사이" 지속 스레드 채팅 (패스 게이트 + 소프트캡 + 기억 + SSE)
// 타로 chat 라우트와 동일 SSE/rate-limit/민감 감지 골격이지만, 수렴(wrap)·[END] 없음 — 대신
// 패스 유무 게이트 + 일일 소프트캡 톤 전환 + 최근창/임계요약 기억 주입 + [CHECKIN:] 파싱.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { buildRelationshipSystemMessage, streamChat, summarizeOlder } from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import {
  detectSensitiveSync,
  detectSensitiveAsync,
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
      "id, user_id, label, status, self_profile_id, partner_profile_id, thread_reading_id, rolling_summary, summarized_msg_count, memo"
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

  const systemMessage = buildRelationshipSystemMessage({
    fileBlock,
    nickname: (userRow?.nickname as string | null) ?? null,
    isFirstEver,
    checkinPrompt: null /* Task 17에서 pending_checkin 주입 */,
    dailyClose,
  });

  const sensitiveSync = detectSensitiveSync(body.message);

  const responseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "X-Daily-Cap": dailyClose ? "reached" : "ok",
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

        // last_visited_at 갱신 + [CHECKIN:] 파싱 → 다음 방문 안부 소재로 memo 에 저장
        const checkin = assistantText.match(CHECKIN_RE);
        const memo = (rel.memo ?? {}) as RelationshipMemo;
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
        if (sensitiveSync) {
          void recordSensitiveAlert({
            match: sensitiveSync,
            userId,
            readingId: rel.thread_reading_id,
            messageText: body.message,
          });
          await supabase
            .from("readings")
            .update({ has_sensitive: true })
            .eq("id", rel.thread_reading_id);

          if (sensitiveSync.certainty !== "high") {
            void detectSensitiveAsync(body.message).then((m) => {
              if (m && m.method !== "regex") {
                void recordSensitiveAlert({
                  match: m,
                  userId,
                  readingId: rel.thread_reading_id!,
                  messageText: body.message,
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
