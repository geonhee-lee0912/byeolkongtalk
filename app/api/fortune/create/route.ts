// 별콩 운세 생성 — 대화 아님. 입력 → Claude 1회 → 리포트 저장 → id 반환.
// 저장: 기존 readings (emotion_tag 센티넬로 운세 종류 표시) + messages(assistant 리포트 1건).

import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { spendStars, chargeStars } from "@/lib/stars";
import { randomUUID } from "crypto";
import { calcSaju, calcTemporalLuck, type SajuInput, type SajuGender, type SajuResult } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { FORTUNE_CONFIG, MAX_TOKENS_BY_FORTUNE, getTarotPositions, type FortuneType } from "@/lib/fortune/types";
import { buildFortuneSystem, FORTUNE_KICKOFF, type TarotDrawnForPrompt } from "@/lib/fortune/prompt";
import { getCard } from "@/lib/tarot/cards";
import {
  parseTarotReportJson,
  buildTarotReport,
  serializeTarotReport,
} from "@/lib/fortune/tarot-report";
import {
  parseDailyReportJson,
  buildDailyReport,
  serializeDailyReport,
} from "@/lib/fortune/daily-report";
import {
  parseMonthlyReportJson,
  buildMonthlyReport,
  serializeMonthlyReport,
} from "@/lib/fortune/monthly-report";
import {
  parseSajuFullReportJson,
  buildSajuFullReport,
  serializeSajuFullReport,
} from "@/lib/fortune/saju-full-report";
import {
  parseCompatReportJson,
  buildCompatReport,
  serializeCompatReport,
} from "@/lib/fortune/compat-report";
import { findTodaysDailyReadingId } from "@/lib/fortune/daily-lookup";
import { findThisMonthMonthlyByProfile } from "@/lib/fortune/monthly-lookup";
import { generateOnce } from "@/lib/claude";
import { logError } from "@/lib/logger";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 생성(Claude 호출)을 응답 이후 백그라운드(after)에서 진행 — 가장 긴 사주 풀이(~240s)도 끝까지 돌도록.
export const maxDuration = 300;

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

interface ValidDrawn {
  position: number;
  label: string;
  card_id: number;
  direction: "upright" | "reversed";
}

// 클라이언트가 보낸 drawnCards를 포지션 정의에 맞춰 검증·정규화.
function validateDrawnCards(
  raw: unknown,
  positions: string[]
): ValidDrawn[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length !== positions.length) return null;
  const seen = new Set<number>();
  const out: ValidDrawn[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (typeof c !== "object" || c === null) return null;
    const cc = c as Record<string, unknown>;
    const cardId = cc.card_id;
    if (!isInt(cardId) || cardId < 0 || cardId > 77) return null;
    if (seen.has(cardId)) return null;
    seen.add(cardId);
    const dir = cc.direction;
    if (dir !== "upright" && dir !== "reversed") return null;
    out.push({
      position: i,
      label: positions[i],
      card_id: cardId,
      direction: dir,
    });
  }
  return out;
}

function validateSajuInput(body: unknown): SajuInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_input" };
  const b = body as Record<string, unknown>;
  const { year, month, day } = b;
  if (!isInt(year) || year < 1900 || year > 2100) return { error: "invalid_year" };
  if (!isInt(month) || month < 1 || month > 12) return { error: "invalid_month" };
  if (!isInt(day) || day < 1 || day > 31) return { error: "invalid_day" };

  const hour =
    b.hour === null || b.hour === undefined
      ? null
      : isInt(b.hour) && b.hour >= 0 && b.hour <= 23
        ? b.hour
        : NaN;
  if (Number.isNaN(hour)) return { error: "invalid_hour" };

  const minute =
    b.minute === null || b.minute === undefined
      ? null
      : isInt(b.minute) && b.minute >= 0 && b.minute <= 59
        ? b.minute
        : NaN;
  if (Number.isNaN(minute)) return { error: "invalid_minute" };

  const gender = b.gender;
  if (gender !== "male" && gender !== "female" && gender !== "other")
    return { error: "invalid_gender" };

  return {
    year,
    month,
    day,
    hour,
    minute,
    isLunar: b.isLunar === true,
    isLeapMonth: b.isLeapMonth === true,
    gender: gender as SajuGender,
  };
}

export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  // Rate limit: Claude API 비용 보호 — 세션 분당 10건 + IP 분당 20건
  maybeSweepExpired();
  const ip = getClientIp(req);
  const bySession = checkRateLimit({ namespace: "fortune_session", key: userId, max: 10, windowMs: 60_000 });
  const byIp = checkRateLimit({ namespace: "fortune_ip", key: ip, max: 20, windowMs: 60_000 });
  if (!bySession.ok || !byIp.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: {
    type?: unknown;
    input?: unknown;
    profileId?: unknown;
    profileA?: unknown;
    profileB?: unknown;
    drawnCards?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const type = body.type as FortuneType;
  const cfg = type && (type in FORTUNE_CONFIG) ? FORTUNE_CONFIG[type] : null;
  if (!cfg || !cfg.active) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  // 오늘의 운세는 하루 한 장 — 같은 날(KST) 이미 본 게 있으면 생성·과금 없이 그 리딩으로 보낸다.
  if (cfg.type === "daily") {
    const existingId = await findTodaysDailyReadingId(userId);
    if (existingId) {
      return NextResponse.json({ id: existingId, success: true, cost: 0, alreadyToday: true });
    }
  }

  // 이번달 운세는 한 달 한 장(프로필별) — 같은 달(KST) 같은 프로필로 이미 본 게 있으면 과금·생성 없이 그 리딩으로.
  // 클라 picker CTA(다시보기)의 서버측 방어 — fetch 실패/레이스/직접 POST 시 중복 과금 방지.
  if (cfg.type === "monthly" && typeof body.profileId === "string" && body.profileId.length > 0) {
    const existing = await findThisMonthMonthlyByProfile(userId);
    const existingId = existing[body.profileId];
    if (existingId) {
      return NextResponse.json({ id: existingId, success: true, cost: 0, alreadyThisMonth: true });
    }
  }

  // 타로 운세는 클라가 이미 카드를 뽑아 보낸다 — 포지션 정의에 맞춰 검증 후 키워드를 프롬프트에 주입.
  let drawnCardsToStore: ValidDrawn[] | null = null;
  let tarotCardsForPrompt: TarotDrawnForPrompt[] | null = null;
  if (cfg.base === "tarot") {
    const positions = getTarotPositions(cfg.type);
    if (!positions) {
      return NextResponse.json({ error: "invalid_type" }, { status: 400 });
    }
    const validated = validateDrawnCards(body.drawnCards, positions);
    if (!validated) {
      return NextResponse.json({ error: "invalid_cards" }, { status: 400 });
    }
    drawnCardsToStore = validated;
    const forPrompt: TarotDrawnForPrompt[] = [];
    for (const d of validated) {
      const card = getCard(d.card_id);
      if (!card) {
        return NextResponse.json({ error: "invalid_cards" }, { status: 400 });
      }
      forPrompt.push({
        position: d.label,
        cardName: card.name_kr,
        direction: d.direction,
        uprightKeywords: card.upright,
        reversedKeywords: card.reversed,
      });
    }
    tarotCardsForPrompt = forPrompt;
  }

  // 사주 기반 운세는 입력 검증 + 서버 계산 (클라 신뢰 X)
  let saju: SajuResult | undefined = undefined;
  let sajuB: SajuResult | undefined = undefined;
  let names: { a: string; b: string } | undefined;
  let sajuInput: SajuInput | undefined;
  let usedProfileId: string | null = null;
  let sajuDataToStore: unknown = null;

  if (cfg.type === "compat" || cfg.type === "compat_social") {
    // 궁합: 두 프로필 id 만 받는다 (즉석 입력도 클라가 먼저 POST /api/profiles 로 저장 후 id 전달).
    const profileA = typeof body.profileA === "string" ? body.profileA : "";
    const profileB = typeof body.profileB === "string" ? body.profileB : "";
    if (!profileA || !profileB) {
      return NextResponse.json({ error: "profile_required" }, { status: 400 });
    }
    if (profileA === profileB) {
      return NextResponse.json({ error: "same_profile" }, { status: 400 });
    }
    const supabase = getServiceSupabase();
    const { data: rows } = await supabase
      .from("user_profiles")
      .select("id, display_name, birth_date, birth_time, is_lunar_input, is_leap_month, gender")
      .in("id", [profileA, profileB])
      .eq("user_id", userId);
    const rowA = rows?.find((r) => r.id === profileA);
    const rowB = rows?.find((r) => r.id === profileB);
    if (!rowA || !rowB) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    saju = calcSaju(profileRowToSajuInput(rowA));
    sajuB = calcSaju(profileRowToSajuInput(rowB));
    names = { a: rowA.display_name, b: rowB.display_name };
    sajuDataToStore = { a: saju, b: sajuB, names };
    usedProfileId = profileA;
  } else if (cfg.base === "saju") {
    if (typeof body.profileId === "string" && body.profileId.length > 0) {
      // 저장된 프로필 재사용 — 소유권 + birth 로드
      const supabase = getServiceSupabase();
      const { data: owned } = await supabase
        .from("user_profiles")
        .select(
          "birth_date, birth_time, is_lunar_input, is_leap_month, gender"
        )
        .eq("id", body.profileId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!owned) {
        return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
      }
      sajuInput = profileRowToSajuInput(owned);
      usedProfileId = body.profileId;
    } else {
      const validated = validateSajuInput(body.input);
      if ("error" in validated) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      sajuInput = validated;
    }
    saju = calcSaju(sajuInput);
    // 오늘/이번 달 들어온 두 글자(일진·월건) — daily/monthly 리포트에서 기운 설명에 사용
    if (cfg.type === "daily" || cfg.type === "monthly") {
      saju.temporal = calcTemporalLuck(new Date(), sajuInput.year);
    }
    sajuDataToStore = saju;
  }

  // 무료 한도 운세(오늘의 운세): 계정당 평생 누적 무료 횟수 소진 후 paidCost 과금
  let effectiveCost = cfg.cost;
  if (cfg.freeLimit && cfg.paidCost !== undefined) {
    const { count } = await getServiceSupabase()
      .from("readings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("emotion_tag", cfg.emotionTag)
      .eq("stars_spent", 0);
    if ((count ?? 0) >= cfg.freeLimit) effectiveCost = cfg.paidCost;
  }

  // 즉시 차감 — 확인을 누른 시점에 별을 먼저 뺀다(고민톡과 동일 감각).
  // 생성·저장이 실패하면 차감했던 별을 자동 환불한다(refundOnFailure).
  let spentBalance: number | undefined;
  if (effectiveCost > 0) {
    const spend = await spendStars(userId, effectiveCost, { source: `fortune_${cfg.type}` });
    if (!spend.success) {
      return NextResponse.json(
        { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: effectiveCost },
        { status: 402 }
      );
    }
    spentBalance = spend.balance;
  }

  const refundOnFailure = async () => {
    if (effectiveCost > 0) {
      await chargeStars(userId, effectiveCost, `refund_${randomUUID()}`, `fortune_refund_${cfg.type}`);
    }
  };

  const systemInput =
    cfg.type === "compat" || cfg.type === "compat_social"
      ? { saju, sajuB, names }
      : cfg.base === "tarot"
        ? { tarotCards: tarotCardsForPrompt! }
        : { saju };

  const supabase = getServiceSupabase();

  // 빈 리딩(assistant 메시지 없음)을 먼저 만들고 id 를 즉시 돌려준다.
  // 실제 Claude 생성·메시지 저장은 응답 이후 백그라운드(after)에서 진행 —
  // 클라가 이탈/새로고침해도 요청 abort 와 분리돼 끝까지 완료된다(리포트 유실·차감 누락 버그 방지).
  // "assistant 메시지가 아직 없는 리딩" = 생성 중 상태 (DB 로 판단).
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      profile_id: usedProfileId,
      question: cfg.label,
      saju_data: sajuDataToStore,
      consultation_type: cfg.base,
      emotion_tag: cfg.emotionTag,
      stars_spent: effectiveCost,
      has_sensitive: false,
      drawn_cards: drawnCardsToStore,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    await refundOnFailure();
    await logError(rErr ?? new Error("reading insert null"), {
      route: "/api/fortune/create",
      userId,
      extra: { stage: "reading_insert", type },
    });
    return NextResponse.json({ error: rErr?.message ?? "reading_insert_failed", refunded: effectiveCost > 0 }, { status: 500 });
  }

  const readingId = reading.id as string;

  // 생성 실패 시: 빈 리딩 삭제 + 환불. (result/목록은 "메시지 없음→생성 중", "리딩 없음→실패"로 판단)
  const failGeneration = async (err: unknown, stage: string) => {
    await supabase.from("readings").delete().eq("id", readingId);
    await refundOnFailure();
    await logError(err, { route: "/api/fortune/create", userId, extra: { stage, type } });
  };

  after(async () => {
    // Claude 1회 호출 → 리포트
    let report: string;
    try {
      const system = buildFortuneSystem(cfg.type, systemInput);
      report = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
    } catch (err) {
      await failGeneration(err, "generate");
      return;
    }
    if (!report || report.length < 20) {
      await failGeneration(new Error("empty_report"), "empty_report");
      return;
    }

    // daily 는 구조화 JSON — 파싱·검증 후 일진(결정론적) 병합본을 저장한다.
    // 파싱 실패 시 1회 재생성, 그래도 실패면 생성 실패 처리(깨진 템플릿 저장 금지).
    let storedContent = report;
    if (cfg.type === "daily") {
      let ai = parseDailyReportJson(report);
      if (!ai) {
        try {
          const system = buildFortuneSystem(cfg.type, { saju });
          const retry = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
          ai = parseDailyReportJson(retry);
        } catch (err) {
          await logError(err, { route: "/api/fortune/create", userId, extra: { type, stage: "daily_retry" } });
        }
      }
      if (!ai || !saju?.temporal) {
        await failGeneration(new Error("daily report parse failed"), "daily_parse");
        return;
      }
      storedContent = serializeDailyReport(buildDailyReport(ai, saju.temporal));
    } else if (cfg.type === "monthly") {
      let ai = parseMonthlyReportJson(report);
      if (!ai) {
        try {
          const system = buildFortuneSystem(cfg.type, { saju });
          const retry = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
          ai = parseMonthlyReportJson(retry);
        } catch (err) {
          await logError(err, { route: "/api/fortune/create", userId, extra: { type, stage: "monthly_retry" } });
        }
      }
      if (!ai || !saju?.temporal) {
        await failGeneration(new Error("monthly report parse failed"), "monthly_parse");
        return;
      }
      storedContent = serializeMonthlyReport(buildMonthlyReport(ai, saju.temporal));
    } else if (cfg.type === "saju_full") {
      let ai = parseSajuFullReportJson(report);
      if (!ai) {
        try {
          const system = buildFortuneSystem(cfg.type, { saju });
          const retry = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
          ai = parseSajuFullReportJson(retry);
        } catch (err) {
          await logError(err, { route: "/api/fortune/create", userId, extra: { type, stage: "saju_full_retry" } });
        }
      }
      if (!ai) {
        await failGeneration(new Error("saju_full report parse failed"), "saju_full_parse");
        return;
      }
      storedContent = serializeSajuFullReport(buildSajuFullReport(ai));
    } else if (cfg.type === "compat" || cfg.type === "compat_social") {
      let ai = parseCompatReportJson(report);
      if (!ai) {
        try {
          const system = buildFortuneSystem(cfg.type, systemInput);
          const retry = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
          ai = parseCompatReportJson(retry);
        } catch (err) {
          await logError(err, { route: "/api/fortune/create", userId, extra: { type, stage: "compat_retry" } });
        }
      }
      if (!ai) {
        await failGeneration(new Error("compat report parse failed"), "compat_parse");
        return;
      }
      storedContent = serializeCompatReport(buildCompatReport(ai));
    } else if (cfg.base === "tarot") {
      let ai = parseTarotReportJson(report);
      if (!ai) {
        try {
          const system = buildFortuneSystem(cfg.type, systemInput);
          const retry = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
          ai = parseTarotReportJson(retry);
        } catch (err) {
          await logError(err, { route: "/api/fortune/create", userId, extra: { type, stage: "tarot_retry" } });
        }
      }
      if (!ai) {
        await failGeneration(new Error("tarot report parse failed"), "tarot_parse");
        return;
      }
      storedContent = serializeTarotReport(buildTarotReport(ai));
    }

    const { error: mErr } = await supabase
      .from("messages")
      .insert([{ reading_id: readingId, role: "assistant", content: storedContent }]);
    if (mErr) {
      await failGeneration(mErr, "message_insert");
    }
  });

  return NextResponse.json({ id: readingId, success: true, cost: effectiveCost, balance: spentBalance });
}
