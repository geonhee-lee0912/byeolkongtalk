// app/api/relationship/chat/route.ts — "우리 사이" 지속 스레드 채팅 (패스 게이트 + 소프트캡 + 기억 + SSE)
// + 인-스레드 스킬(Phase 1: 싸움 판정): skillStart 로 개시(30별 차감·active_skill 세팅·비영속 트리거로
//   별콩이 도입 스트리밍), 이후 일반 턴은 active_skill 이 있으면 판정 가이드 주입 + skill_key 태깅(캡 제외)
//   + [SKILL_DONE] 종료(안전 턴캡). 자유대화 경로는 기존 그대로.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import {
  buildRelationshipSystemMessage,
  streamChat,
  summarizeOlder,
  computeTurnSignals,
  generateOnce,
  formatDrawnCardsBlock,
  VERDICT_INTHREAD_TURN_CAP,
} from "@/lib/claude";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";
import { logError, ctxFromRequest } from "@/lib/logger";
import { resolveSensitive, recordSensitiveAlert } from "@/lib/sensitive";
import { spendStars, chargeStars } from "@/lib/stars";
import { getSkill } from "@/lib/relationship/skills";
import { getActivePass, getTodayThreadTurns, getTodayExtendCount } from "@/lib/relationship/passes";
import {
  dailyTurnAllowance,
  type RelationshipMemo,
  type RelationshipStatus,
} from "@/lib/relationship/types";
import {
  splitThreadMessages,
  buildRelationshipFileBlock,
  appendSkillLog,
  grantSkillGrace,
  consumeSkillGrace,
  cleanSummary,
  type ThreadMsg,
} from "@/lib/relationship/memory";
import { calcSaju } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { MAX_TOKENS_BY_FORTUNE } from "@/lib/fortune/types";
import {
  parseCompatReportJson,
  buildCompatReport,
  serializeCompatReport,
} from "@/lib/fortune/compat-report";
import { redactCompatForModel } from "@/lib/relationship/compat-thread";
import { SPREAD_INFO, getPositionLabels } from "@/lib/tarot/spreads";
import { extractClosingLine } from "@/lib/saju/closing";
import {
  serializeThreadDraw,
  validateDrawnCards,
  redactDrawForModel,
} from "@/lib/relationship/draw-thread";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// compat 스킬은 동기 generateOnce(Claude 호출 — parse 실패 시 1회 재시도 + 내부 empty 재시도로
// 최악 수 회 순차)를 요청 내에서 처리 → 자매 원샷 리포트 라우트(fortune/create)와 동일 여유.
export const maxDuration = 300;

const MAX_MESSAGE_LEN = 8000;
const CHECKIN_RE = /\[CHECKIN:([^\]]+)\]/;
const SKILL_DONE_RE = /\[SKILL_DONE\]/;
// 판정 개시 시 별콩이의 도입(1단계)을 여는 비영속 트리거 — DB에 저장하지 않음(스레드 오염 방지).
const VERDICT_KICKOFF = "우리 사이에 다툼이 있었어. 잘잘못을 판정받고 싶어.";
// 카드뽑기 개시 트리거 — 비영속(DB 미저장), alternation 맞추기용 마지막 user 메시지.
const DRAW_KICKOFF = "방금 카드를 뽑았어. 펼쳐서 봐줘.";
// 카드 풀이는 값을 치른 결과물 — 일반 턴(1400)의 2배.
const DRAW_MAX_TOKENS = 2800;

interface Body {
  relationshipId: string;
  message?: string;
  skillStart?: string;
  /** kind="tarot_draw" 스킬 개시 시 클라가 뽑은 카드(서버가 위조 검증 + label 재계산). */
  drawnCards?: unknown;
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  // Rate limit: Claude API 비용 보호 — 세션당 분당 20건 + IP당 분당 60건
  maybeSweepExpired();
  const ip = getClientIp(request);
  const bySession = checkRateLimit({ namespace: "rel_chat_session", key: userId, max: 20, windowMs: 60_000 });
  const byIp = checkRateLimit({ namespace: "rel_chat_ip", key: ip, max: 60, windowMs: 60_000 });
  if (!bySession.ok || !byIp.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.relationshipId) {
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
  const threadReadingId = rel.thread_reading_id as string;

  const memoObj = (rel.memo ?? {}) as RelationshipMemo;
  const activeSkill = memoObj.active_skill ?? null;

  // 패스 게이트 — 활성 패스 없으면 대화 불가. 단 대화형(kind="dialogue") 스킬 세그먼트 진행 중이면
  // 이미 결제된 멀티턴 세그먼트라 통과시킨다(패스 만료 mid-verdict 에도 유료 판정을 마치게).
  // 드로우·궁합 락은 수십 초짜리 인-플라이트 락이라 우회 대상이 아니다 — 굳은 락이 남았을 때
  // 패스 만료 유저에게 무기한 무료 자유대화가 열리는 구멍이 된다.
  const inDialogueSkill = !!activeSkill && getSkill(activeSkill.key)?.kind === "dialogue";
  const pass = await getActivePass(rel.id);
  if (!pass && !inDialogueSkill) {
    return NextResponse.json({ error: "pass_required" }, { status: 402 });
  }

  const encoder = new TextEncoder();

  // ── 인-스레드 스킬 개시 (Phase 1: 판정) ───────────────────────────
  if (body.skillStart) {
    // ── Phase 2: 궁합(compat) — 원샷 구조화 리포트를 스레드 카드로(JSON 반환) ──
    if (body.skillStart === "compat") {
      const skill = getSkill("compat");
      if (!skill) return NextResponse.json({ error: "skill_not_found" }, { status: 500 });
      const memo = (rel.memo ?? {}) as RelationshipMemo;

      // 인-플라이트 락 — 중복 차감 방지. compat 락이 6분 초과면 stale 로 override(하드 크래시 복구).
      // 임계치는 maxDuration(300s)보다 길어야 한다 — 짧으면 정상 진행 중인 요청을 stale 로 오인해
      // 덮어쓰고 이중 차감이 난다.
      const STALE_MS = 6 * 60 * 1000;
      if (activeSkill) {
        const started = activeSkill.started_at ? new Date(activeSkill.started_at).getTime() : 0;
        const stale = activeSkill.key === "compat" && Date.now() - started > STALE_MS;
        if (!stale) return NextResponse.json({ error: "skill_already_active" }, { status: 400 });
      }

      // 두 프로필 로드 + 생년월일 검증 (서버 최종 권위)
      if (!rel.partner_profile_id) return NextResponse.json({ error: "partner_birth_required" }, { status: 400 });
      if (!rel.self_profile_id) return NextResponse.json({ error: "self_birth_required" }, { status: 400 });
      const { data: profRows } = await supabase
        .from("user_profiles")
        .select("id, display_name, birth_date, birth_time, is_lunar_input, is_leap_month, gender")
        .in("id", [rel.self_profile_id, rel.partner_profile_id])
        .eq("user_id", userId);
      const selfRow = profRows?.find((r) => r.id === rel.self_profile_id);
      const partnerRow = profRows?.find((r) => r.id === rel.partner_profile_id);
      if (!selfRow?.birth_date || !partnerRow?.birth_date) {
        return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
      }

      // 40별 차감 (서버 최종 권위). 실패 시 402 → 클라가 /shop.
      const spend = await spendStars(userId, skill.starCost, {
        readingId: threadReadingId,
        source: "rel_skill_compat",
      });
      if (!spend.success) {
        return NextResponse.json(
          { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: skill.starCost },
          { status: 402 }
        );
      }

      // 인-플라이트 락 세팅
      memo.active_skill = { key: "compat", started_at: new Date().toISOString(), assistant_turns: 0 };
      await supabase.from("relationships").update({ memo }).eq("id", rel.id);

      const refundAndUnlock = async (): Promise<boolean> => {
        let refunded = false;
        try {
          const r = await chargeStars(userId, skill.starCost, `refund_${randomUUID()}`, "rel_skill_compat_refund");
          refunded = r.success;
        } catch {
          refunded = false;
        }
        if (!refunded) {
          await logError(
            new Error("compat refund failed"),
            ctxFromRequest(request, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "compat_refund" } })
          );
        }
        memo.active_skill = null;
        await supabase.from("relationships").update({ memo }).eq("id", rel.id);
        return refunded;
      };

      try {
        const saju = calcSaju(profileRowToSajuInput(selfRow));
        const sajuB = calcSaju(profileRowToSajuInput(partnerRow));
        const system = buildFortuneSystem("compat", {
          saju,
          sajuB,
          names: { a: selfRow.display_name, b: partnerRow.display_name },
        });
        const logCtx = { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "compat" } };
        let ai = parseCompatReportJson(
          await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE.compat, logCtx)
        );
        if (!ai) {
          ai = parseCompatReportJson(
            await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE.compat, logCtx)
          );
        }
        if (!ai) throw new Error("compat_parse_failed");

        const report = buildCompatReport(ai);
        const now = new Date().toISOString();
        await supabase.from("messages").insert([
          { reading_id: threadReadingId, role: "assistant", content: serializeCompatReport(report), skill_key: "compat", created_at: now },
        ]);
        const withLog = appendSkillLog(memo, "compat", threadReadingId, report.summary, now);
        withLog.active_skill = null;
        await supabase.from("relationships").update({ memo: withLog, last_visited_at: now }).eq("id", rel.id);

        return NextResponse.json({ report });
      } catch (err) {
        const refunded = await refundAndUnlock();
        await logError(err, ctxFromRequest(request, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "compat" } }));
        return NextResponse.json({ error: "compat_generation_failed", refunded }, { status: 500 });
      }
    }

    // ── Phase 3: 카드뽑기(tarot_draw) — 뽑은 카드로 인-스레드 풀이 1턴 스트리밍 ──
    const drawSkill = getSkill(body.skillStart);
    if (drawSkill?.kind === "tarot_draw" && drawSkill.spread) {
      const spread = drawSkill.spread;

      // 인-플라이트 락 — 중복 차감 방지. 같은 스킬 락이 6분 초과면 stale override(하드 크래시 복구).
      // 임계치는 maxDuration(300s)보다 길어야 한다 — 짧으면 정상 진행 중인 스트림을 stale 로 오인해
      // 덮어쓰고 이중 차감이 난다.
      const STALE_MS = 6 * 60 * 1000;
      if (activeSkill) {
        const started = activeSkill.started_at ? new Date(activeSkill.started_at).getTime() : 0;
        const stale = activeSkill.key === drawSkill.key && Date.now() - started > STALE_MS;
        if (!stale) return NextResponse.json({ error: "skill_already_active" }, { status: 400 });
      }
      // 패스 필수 — 기존 /api/consultations/tarot 검증의 이관.
      if (!pass) return NextResponse.json({ error: "pass_required" }, { status: 402 });

      // 카드 위조 검증 — label 은 클라 값을 버리고 서버가 재계산(최종 권위).
      const labels = getPositionLabels(spread, "love", null);
      const cards = validateDrawnCards(body.drawnCards, SPREAD_INFO[spread].cardCount, labels);
      if (!cards) return NextResponse.json({ error: "invalid_cards" }, { status: 400 });

      // 차감 (서버 최종 권위). 실패 시 402 → 클라가 /shop.
      const spend = await spendStars(userId, drawSkill.starCost, {
        readingId: threadReadingId,
        source: `rel_skill_${drawSkill.key}`,
      });
      if (!spend.success) {
        return NextResponse.json(
          { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: drawSkill.starCost },
          { status: 402 }
        );
      }

      // ── 차감 완료 지점 ──
      // 여기서부터 `return new Response` 까지 모든 실패는 반드시 rollbackDraw(환불 + 스트립 삭제 +
      // 락 해제)를 지나야 한다. 락 update · 스트립 insert · 최근창 select · 페르소나 파일 로드
      // (buildRelationshipSystemMessage 내부 readFileSync) 전부 throw 가능 구간이다.
      const drawLogCtx = { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "draw", skill: drawSkill.key } };
      // 스트립 insert 는 아래 try 안에서 일어나므로, rollbackDraw 는 이 변수를 클로저로 읽는다.
      let stripMessageId: string | null = null;
      const rollbackDraw = async (err: unknown) => {
        const refund = await chargeStars(
          userId,
          drawSkill.starCost,
          `refund_${randomUUID()}`,
          `rel_skill_${drawSkill.key}_refund`
        ).catch(() => null);
        if (!refund?.success) {
          await logError(new Error("draw_refund_failed"), ctxFromRequest(request, drawLogCtx));
        }
        if (stripMessageId) {
          await supabase.from("messages").delete().eq("id", stripMessageId);
        }
        const undo = (rel.memo ?? {}) as RelationshipMemo;
        undo.active_skill = null;
        await supabase.from("relationships").update({ memo: undo }).eq("id", rel.id);
        await logError(err, ctxFromRequest(request, drawLogCtx));
      };

      try {
        // 인-플라이트 락 세팅
        const lockAt = new Date().toISOString();
        {
          const lockMemo = (rel.memo ?? {}) as RelationshipMemo;
          lockMemo.active_skill = { key: drawSkill.key, started_at: lockAt, assistant_turns: 0 };
          await supabase.from("relationships").update({ memo: lockMemo }).eq("id", rel.id);
        }

        // 카드 스트립 메시지 — 스트림 전에 저장(뽑은 결과가 먼저 스레드에 눌러앉음).
        // id 를 확보해 실패 시 이 row 만 정확히 삭제한다.
        const { data: stripRow } = await supabase
          .from("messages")
          .insert({
            reading_id: threadReadingId,
            role: "assistant",
            content: serializeThreadDraw({ skill: drawSkill.key, spread, cards }),
            skill_key: drawSkill.key,
            created_at: lockAt,
          })
          .select("id")
          .single();
        stripMessageId = stripRow?.id ?? null;

        // 모델 입력 = 최근창(스레드 맥락 · compat/스트립 치환) + 비영속 드로우 트리거
        const { data: pastRows } = await supabase
          .from("messages")
          .select("role, content")
          .eq("reading_id", threadReadingId)
          .order("created_at", { ascending: true });
        const past = redactDrawForModel(redactCompatForModel((pastRows ?? []) as ThreadMsg[]));
        const split = splitThreadMessages(past, rel.summarized_msg_count ?? 0);
        const apiMessages = [...split.apiMessages, { role: "user" as const, content: DRAW_KICKOFF }];

        const fileBlock = buildRelationshipFileBlock(
          {
            label: rel.label,
            status: rel.status as RelationshipStatus,
            hasSelfBirth: !!rel.self_profile_id,
            hasPartnerBirth: !!rel.partner_profile_id,
            memo: memoObj,
          },
          rel.rolling_summary
        );
        const systemMessage = buildRelationshipSystemMessage({
          fileBlock,
          isFirstEver: false,
          checkinPrompt: null,
          dailyClose: false,
          drawContext: {
            spreadLabel: `${drawSkill.label} · ${cards.length}장`,
            cardsBlock: formatDrawnCardsBlock(cards),
          },
        });

        let drawText = "";
        const drawStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of streamChat(systemMessage, apiMessages, DRAW_MAX_TOKENS, drawLogCtx)) {
                drawText += chunk;
                controller.enqueue(encoder.encode(chunk));
              }
              if (!drawText.trim()) throw new Error("empty_assistant_stream");

              // 풀이 저장 + skill_log 적립 + 그레이스 적립 + 락 해제 (한 update)
              const now = new Date().toISOString();
              await supabase.from("messages").insert([
                { reading_id: threadReadingId, role: "assistant", content: drawText, skill_key: drawSkill.key, created_at: now },
              ]);
              const summary = extractClosingLine([{ role: "assistant", content: drawText }]) ?? "";
              const doneMemo = (rel.memo ?? {}) as RelationshipMemo;
              const withGrace = grantSkillGrace(
                appendSkillLog(doneMemo, drawSkill.key, threadReadingId, summary, now),
                drawSkill.key,
                drawSkill.graceTurns ?? 0
              );
              withGrace.active_skill = null;
              await supabase.from("relationships").update({ memo: withGrace, last_visited_at: now }).eq("id", rel.id);

              controller.close();
            } catch (err) {
              // 스트림 개시 후 실패 담당. 아래 외곽 catch 와는 배타 — return 이 끝난 뒤에만 실행된다.
              await rollbackDraw(err);
              controller.error(err);
            }
          },
        });
        return new Response(drawStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      } catch (err) {
        // 스트림 반환 전 실패 담당(락/스트립/최근창/페르소나 로드). 위 스트림 catch 와 배타.
        await rollbackDraw(err);
        return NextResponse.json({ error: "draw_setup_failed" }, { status: 500 });
      }
    }

    if (body.skillStart !== "verdict") {
      return NextResponse.json({ error: "unsupported_skill" }, { status: 400 });
    }
    if (activeSkill) {
      return NextResponse.json({ error: "skill_already_active" }, { status: 400 });
    }
    const skill = getSkill("verdict");
    if (!skill) return NextResponse.json({ error: "skill_not_found" }, { status: 500 });

    // 30별 차감 (서버 최종 권위). 실패 시 402 → 클라가 /shop.
    const spend = await spendStars(userId, skill.starCost, {
      readingId: threadReadingId,
      source: "rel_skill_verdict",
    });
    if (!spend.success) {
      return NextResponse.json(
        { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: skill.starCost },
        { status: 402 }
      );
    }

    // 모델 입력 = 최근창(스레드 맥락) + 비영속 판정 트리거(맨 끝 user)
    const { data: pastRows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("reading_id", threadReadingId)
      .order("created_at", { ascending: true });
    const past = redactDrawForModel(redactCompatForModel((pastRows ?? []) as ThreadMsg[]));
    const split = splitThreadMessages(past, rel.summarized_msg_count ?? 0);
    const apiMessages = [...split.apiMessages, { role: "user" as const, content: VERDICT_KICKOFF }];

    const fileBlock = buildRelationshipFileBlock(
      {
        label: rel.label,
        status: rel.status as RelationshipStatus,
        hasSelfBirth: !!rel.self_profile_id,
        hasPartnerBirth: !!rel.partner_profile_id,
        memo: memoObj,
      },
      rel.rolling_summary
    );
    const systemMessage = buildRelationshipSystemMessage({
      fileBlock,
      isFirstEver: false,
      checkinPrompt: null,
      dailyClose: false,
      activeSkill: { key: "verdict", assistantTurns: 0, forceEnd: false },
    });

    let assistantText = "";
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat(systemMessage, apiMessages, 1400, {
            route: "/api/relationship/chat",
            userId,
            extra: { relationshipId: rel.id, stage: "skillStart" },
          })) {
            assistantText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          if (!assistantText.trim()) throw new Error("empty_assistant_stream");

          // 도입 성공 → assistant 저장(skill_key 태깅) + active_skill 세팅(assistant_turns=1)
          const now = new Date().toISOString();
          await supabase.from("messages").insert([
            { reading_id: threadReadingId, role: "assistant", content: assistantText, skill_key: "verdict", created_at: now },
          ]);
          const memo = (rel.memo ?? {}) as RelationshipMemo;
          memo.active_skill = { key: "verdict", started_at: now, assistant_turns: 1 };
          await supabase.from("relationships").update({ memo, last_visited_at: now }).eq("id", rel.id);

          controller.close();
        } catch (err) {
          // 차감했는데 도입 실패 → 30별 환불 (active_skill 미설정이라 롤백 불필요)
          await chargeStars(userId, skill.starCost, `refund_${randomUUID()}`, "rel_skill_verdict_refund").catch(() => {});
          await logError(err, ctxFromRequest(request, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id, stage: "skillStart" } }));
          controller.error(err);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── 일반 메시지 (자유대화 or 판정 세그먼트 진행) ───────────────────
  if (typeof body.message !== "string" || body.message.length < 1 || body.message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  // 위 가드로 string 확정 — const로 잡아 ReadableStream 클로저 내 narrowing 소실(TS2322) 방지.
  const userMessage: string = body.message;
  const inVerdict = activeSkill?.key === "verdict";
  // 카드뽑기 그레이스 — 잔여가 있으면 이 왕복은 하루 캡에서 면제(구매한 대화 분량).
  const graceKey = (memoObj.skill_grace?.remaining ?? 0) > 0 ? memoObj.skill_grace!.key : null;

  // 소프트캡 — 판정 세그먼트는 캡 무관(유료·skill_key 제외). 일반 대화만 캡 톤.
  const [todayTurns, todayExtend] = await Promise.all([
    getTodayThreadTurns(threadReadingId),
    getTodayExtendCount(userId),
  ]);
  const dailyClose = !inVerdict && !graceKey && todayTurns >= dailyTurnAllowance(todayExtend);

  // 누적 메시지(오름차순) → 최근창/요약델타 분할
  const { data: pastRows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("reading_id", threadReadingId)
    .order("created_at", { ascending: true });
  const past = redactDrawForModel(redactCompatForModel((pastRows ?? []) as ThreadMsg[]));
  const isFirstEver = !inVerdict && past.length === 0;
  const split = splitThreadMessages(
    [...past, { role: "user", content: userMessage }],
    rel.summarized_msg_count ?? 0
  );

  const fileBlock = buildRelationshipFileBlock(
    {
      label: rel.label,
      status: rel.status as RelationshipStatus,
      hasSelfBirth: !!rel.self_profile_id,
      hasPartnerBirth: !!rel.partner_profile_id,
      memo: memoObj,
    },
    rel.rolling_summary
  );

  // 복귀 안부 — 판정 세그먼트 중엔 끔. pending 처방 + 마지막 방문 6h+ 조건.
  const CHECKIN_GAP_MS = 6 * 60 * 60 * 1000;
  const lastVisit = rel.last_visited_at ? new Date(rel.last_visited_at as string).getTime() : 0;
  const checkinPrompt =
    !inVerdict && memoObj.pending_checkin && Date.now() - lastVisit > CHECKIN_GAP_MS
      ? memoObj.pending_checkin.text
      : null;

  const verdictForceEnd = inVerdict && activeSkill!.assistant_turns + 1 >= VERDICT_INTHREAD_TURN_CAP;

  const systemMessage = buildRelationshipSystemMessage({
    fileBlock,
    isFirstEver,
    checkinPrompt,
    dailyClose,
    turnSignals: computeTurnSignals(past, userMessage),
    activeSkill: inVerdict
      ? { key: "verdict", assistantTurns: activeSkill!.assistant_turns, forceEnd: verdictForceEnd }
      : null,
  });

  // sensitive 게이트 감지 — high 는 regex 즉시 확정, 회색지대는 haiku 2차 판정 후 확정
  const sensitiveMatch = await resolveSensitive(userMessage);

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

  let assistantText = "";
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(systemMessage, split.apiMessages, 1400, {
          route: "/api/relationship/chat",
          userId,
          extra: { relationshipId: rel.id, threadReadingId, inVerdict },
        })) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        if (!assistantText.trim()) throw new Error("empty_assistant_stream");

        // 판정 세그먼트: 턴캡 도달인데 마커 없으면 서버가 [SKILL_DONE] 보장
        if (inVerdict && verdictForceEnd && !SKILL_DONE_RE.test(assistantText)) {
          const tail = "\n\n[SKILL_DONE]";
          assistantText += tail;
          controller.enqueue(encoder.encode(tail));
        }

        const turnTs = Date.now();
        const skillTag = inVerdict ? "verdict" : graceKey;
        await supabase.from("messages").insert([
          { reading_id: threadReadingId, role: "user", content: userMessage, skill_key: skillTag, created_at: new Date(turnTs).toISOString() },
          { reading_id: threadReadingId, role: "assistant", content: assistantText, skill_key: skillTag, created_at: new Date(turnTs + 1).toISOString() },
        ]);

        const memo = (rel.memo ?? {}) as RelationshipMemo;
        const nowIso = new Date().toISOString();

        if (inVerdict) {
          // 판정 진행/종료 — [SKILL_DONE]이면 active_skill 해제 + skill_log 적립(recap X)
          if (SKILL_DONE_RE.test(assistantText)) {
            const summary = cleanSummary(assistantText.replace(/\[SKILL_DONE\]/g, "").trim());
            const withLog = appendSkillLog(memo, "verdict", threadReadingId, summary, nowIso);
            withLog.active_skill = null;
            await supabase.from("relationships").update({ memo: withLog, last_visited_at: nowIso }).eq("id", rel.id);
          } else {
            memo.active_skill = { key: "verdict", started_at: activeSkill!.started_at, assistant_turns: activeSkill!.assistant_turns + 1 };
            await supabase.from("relationships").update({ memo, last_visited_at: nowIso }).eq("id", rel.id);
          }
        } else {
          // 자유대화 — 복귀 안부 소진 + [CHECKIN:] 신규 파싱 (기존 로직)
          if (checkinPrompt && memo.pending_checkin) {
            memo.prescriptions = [
              ...(memo.prescriptions ?? []),
              { text: memo.pending_checkin.text, created_at: memo.pending_checkin.created_at, resolved_at: nowIso },
            ].slice(-30);
            memo.pending_checkin = null;
          }
          const checkin = assistantText.match(CHECKIN_RE);
          if (checkin) {
            memo.pending_checkin = { text: checkin[1].trim(), created_at: nowIso };
          }
          // 그레이스 소진 — 판정 세그먼트가 아니고 잔여가 있던 왕복만 1턴 차감.
          if (!inVerdict && graceKey) {
            const consumed = consumeSkillGrace(memo);
            memo.skill_grace = consumed.skill_grace ?? null;
          }
          await supabase.from("relationships").update({ last_visited_at: nowIso, memo }).eq("id", rel.id);

          // 임계 요약 (fire-and-forget) — 자유대화에만
          if (split.toSummarize.length > 0) {
            void summarizeOlder(rel.rolling_summary, split.toSummarize)
              .then((sum) =>
                supabase
                  .from("relationships")
                  .update({ rolling_summary: sum, summarized_msg_count: split.newSummarizedCount })
                  .eq("id", rel.id)
              )
              .catch((e) => console.warn("[rel] summarize 실패:", e));
          }
        }

        // 민감 감지 — regex 1차 + 회색지대 haiku 2차 (판정/자유대화 공통)
        if (sensitiveMatch) {
          void recordSensitiveAlert({ match: sensitiveMatch, userId, readingId: threadReadingId, messageText: userMessage });
          await supabase.from("readings").update({ has_sensitive: true }).eq("id", threadReadingId);
        }

        controller.close();
      } catch (err) {
        await logError(
          err,
          ctxFromRequest(request, { route: "/api/relationship/chat", userId, extra: { relationshipId: rel.id } })
        );
        controller.error(err);
      }
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
