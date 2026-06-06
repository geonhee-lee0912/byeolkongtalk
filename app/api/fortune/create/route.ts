// 별콩 운세 생성 — 대화 아님. 입력 → Claude 1회 → 리포트 저장 → id 반환.
// 저장: 기존 readings (emotion_tag 센티넬로 운세 종류 표시) + messages(assistant 리포트 1건).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getStarBalance, spendStars } from "@/lib/stars";
import { calcSaju, calcTemporalLuck, type SajuInput, type SajuGender } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { FORTUNE_CONFIG, MAX_TOKENS_BY_FORTUNE, type FortuneType } from "@/lib/fortune/types";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import {
  parseDailyReportJson,
  buildDailyReport,
  serializeDailyReport,
} from "@/lib/fortune/daily-report";
import { findTodaysDailyReadingId } from "@/lib/fortune/daily-lookup";
import { generateOnce } from "@/lib/claude";
import { logError, ctxFromRequest } from "@/lib/logger";
import { checkRateLimit, getClientIp, maybeSweepExpired } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
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

  let body: { type?: unknown; input?: unknown; profileId?: unknown };
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

  // 사주 기반 운세는 입력 검증 + 서버 계산 (클라 신뢰 X)
  let saju = undefined;
  let sajuInput: SajuInput | undefined;
  if (cfg.base === "saju") {
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
    } else {
      const validated = validateSajuInput(body.input);
      if ("error" in validated) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      sajuInput = validated;
    }
    saju = calcSaju(sajuInput);
    // 오늘 들어온 두 글자(일진) — daily 리포트에서 오늘 기운 설명에 사용
    if (cfg.type === "daily") {
      saju.temporal = calcTemporalLuck(new Date(), sajuInput.year);
    }
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

  // 유료 운세 잔액 사전 확인
  if (effectiveCost > 0) {
    const balance = await getStarBalance(userId);
    if (balance < effectiveCost) {
      return NextResponse.json(
        { error: "Insufficient stars", code: "INSUFFICIENT_STARS", balance, required: effectiveCost },
        { status: 402 }
      );
    }
  }

  // Claude 1회 호출 → 리포트
  let report: string;
  try {
    const system = buildFortuneSystem(cfg.type, { saju });
    report = await generateOnce(system, [{ role: "user", content: FORTUNE_KICKOFF }], MAX_TOKENS_BY_FORTUNE[cfg.type]);
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/fortune/create", userId, extra: { type } }));
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }
  if (!report || report.length < 20) {
    return NextResponse.json({ error: "empty_report" }, { status: 502 });
  }

  // daily 는 구조화 JSON — 파싱·검증 후 일진(결정론적) 병합본을 저장한다.
  // 파싱 실패 시 1회 재생성, 그래도 실패면 생성 실패 처리(깨진 템플릿 저장 금지).
  let storedContent = report;
  if (cfg.type === "daily") {
    let ai = parseDailyReportJson(report);
    if (!ai) {
      try {
        const system = buildFortuneSystem(cfg.type, { saju });
        const retry = await generateOnce(
          system,
          [{ role: "user", content: FORTUNE_KICKOFF }],
          MAX_TOKENS_BY_FORTUNE[cfg.type]
        );
        ai = parseDailyReportJson(retry);
      } catch (err) {
        await logError(err, ctxFromRequest(req, { route: "/api/fortune/create", userId, extra: { type, stage: "daily_retry" } }));
      }
    }
    if (!ai || !saju?.temporal) {
      await logError(new Error("daily report parse failed"), {
        route: "/api/fortune/create",
        userId,
        extra: { stage: "daily_parse", type },
      });
      return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    }
    storedContent = serializeDailyReport(buildDailyReport(ai, saju.temporal));
  }

  const supabase = getServiceSupabase();

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      profile_id: null,
      question: cfg.label,
      saju_data: saju ?? null,
      consultation_type: cfg.base,
      emotion_tag: cfg.emotionTag,
      stars_spent: effectiveCost,
      has_sensitive: false,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    await logError(rErr ?? new Error("reading insert null"), {
      route: "/api/fortune/create",
      userId,
      extra: { stage: "reading_insert", type },
    });
    return NextResponse.json({ error: rErr?.message ?? "reading_insert_failed" }, { status: 500 });
  }

  const { error: mErr } = await supabase
    .from("messages")
    .insert([{ reading_id: reading.id, role: "assistant", content: storedContent }]);
  if (mErr) {
    await supabase.from("readings").delete().eq("id", reading.id);
    await logError(mErr, { route: "/api/fortune/create", userId, extra: { stage: "message_insert", type } });
    return NextResponse.json({ error: "message_insert_failed" }, { status: 500 });
  }

  // 유료면 별 차감 (실패 시 롤백)
  let balance: number | undefined;
  if (effectiveCost > 0) {
    const spend = await spendStars(userId, effectiveCost, {
      readingId: reading.id,
      source: `fortune_${cfg.type}`,
    });
    if (!spend.success) {
      await supabase.from("messages").delete().eq("reading_id", reading.id);
      await supabase.from("readings").delete().eq("id", reading.id);
      return NextResponse.json(
        { error: "Insufficient stars", code: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance, required: effectiveCost },
        { status: 402 }
      );
    }
    balance = spend.balance;
  }

  return NextResponse.json({ id: reading.id, success: true, cost: effectiveCost, balance });
}
