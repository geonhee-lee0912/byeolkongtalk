// app/api/byeolmaru/daily-report/route.ts — 별마루 유료 오늘 사주.
// 기존 /api/fortune/create 의 daily 리포트 생성(같은 프롬프트·파서·모델)을 그대로 재사용,
// 구독 게이트(비자격자는 프로필 조회·LLM 호출 전에 즉시 차단 = 원가 0) + (유저,오늘) 캐시만 얹는다.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { kstDate } from "@/lib/admin-time";
import { MAX_TOKENS_BY_FORTUNE } from "@/lib/fortune/types";
import { buildFortuneSystem, FORTUNE_KICKOFF } from "@/lib/fortune/prompt";
import { parseDailyReportJson, buildDailyReport } from "@/lib/fortune/daily-report";
import { fortuneResponseFormat } from "@/lib/fortune/response-format";
import { fortuneModel } from "@/lib/fortune/model";
import { generateOnce } from "@/lib/claude";
import { getCachedDailyReport, saveDailyReport } from "@/lib/byeolmaru/daily-report";
import { logError, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  try {
    // 자격 게이트를 프로필 조회·사주 계산보다 먼저 — 비자격자는 여기서 끝(LLM 은 물론 DB 프로필 조회도 없음 = 원가 0).
    const ent = await getEntitlement(userId);
    if (!ent.entitled) {
      return NextResponse.json({ error: "subscription_required", code: "LOCKED" }, { status: 403 });
    }

    // 프로필→사주 — app/api/byeolmaru/narrative/route.ts 와 동일 패턴
    // (is_primary:true 고정 이유는 그 라우트의 주석 참조 — 상대 프로필과의 혼선 방지).
    const { data: row, error } = await getServiceSupabase()
      .from("user_profiles")
      .select("birth_date, birth_time, is_lunar_input, is_leap_month, gender")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    if (error) {
      await logError(error, ctxFromRequest(req, { route: "/api/byeolmaru/daily-report", userId }));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    // birth_date 는 P2 부터 nullable(생일 없는 프로필 가능) — 사주 판정은 생일이 필수.
    if (!row || !row.birth_date) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const input = profileRowToSajuInput(row);
    const saju = calcSaju(input);

    const todayKst = kstDate(new Date().toISOString());
    // ⚠️ includeMonth 옵션 없이 호출 — app/api/fortune/create/route.ts 의 daily 경로와 동일
    // (includeMonth:true 는 good_days 전용 30일 일진; daily/monthly 는 옵션 없이 호출한다).
    const temporal = calcTemporalLuck(baseDateForKst(todayKst), input.year);
    if (!temporal.day) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }
    // 🔴 create/route.ts 처럼 프롬프트 빌드 전에 오늘 일진을 saju 에 붙인다 — sajuBlock 은
    // saju.temporal 이 있을 때만 '오늘 들어온 두 글자' 일진 블록을 넣고, 없으면 {{TODAY_PILLAR}}
    // 가 placeholder("오늘의 일진")로 떨어져 일진 그라운딩이 통째로 빠진다(daily 리포트의 핵심).
    saju.temporal = temporal;

    // 캐시 히트 — 오늘(유저,날짜) 이미 생성된 리포트가 있으면 재생성 없이 그대로 반환.
    const cached = await getCachedDailyReport(userId, todayKst);
    if (cached) {
      return NextResponse.json({ report: cached });
    }

    // 생성 — app/api/fortune/create/route.ts 의 daily 경로와 동일한 프롬프트·모델·파서(+실패 시 1회 재시도).
    const logCtx = { route: "/api/byeolmaru/daily-report", userId };
    const system = buildFortuneSystem("daily", { saju });
    const raw = await generateOnce(
      system,
      [{ role: "user", content: FORTUNE_KICKOFF }],
      MAX_TOKENS_BY_FORTUNE.daily,
      logCtx,
      fortuneModel("daily"),
      fortuneResponseFormat("daily")
    );
    let ai = parseDailyReportJson(raw);
    if (!ai) {
      const retrySystem = buildFortuneSystem("daily", { saju });
      const retry = await generateOnce(
        retrySystem,
        [{ role: "user", content: FORTUNE_KICKOFF }],
        MAX_TOKENS_BY_FORTUNE.daily,
        logCtx,
        fortuneModel("daily"),
        fortuneResponseFormat("daily")
      );
      ai = parseDailyReportJson(retry);
    }
    if (!ai) {
      await logError(
        new Error("daily report parse failed"),
        ctxFromRequest(req, { ...logCtx, extra: { stage: "daily_parse" } })
      );
      return NextResponse.json({ report: null });
    }

    const report = buildDailyReport(ai, temporal);

    // 캐시 저장은 best-effort — 실패해도 이미 만든 리포트는 그대로 응답한다(다음 요청에서 재생성될 뿐).
    try {
      await saveDailyReport(userId, todayKst, report);
    } catch (err) {
      await logError(err, ctxFromRequest(req, { ...logCtx, extra: { stage: "cache_save" } }));
    }

    return NextResponse.json({ report });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/daily-report", userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
