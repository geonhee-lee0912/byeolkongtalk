// app/api/byeolmaru/daily-report/route.ts — 별마루 유료 오늘 사주.
// 기존 /api/fortune/create 의 daily 리포트 생성(같은 프롬프트·파서·모델)을 그대로 재사용,
// (유저,날짜) 캐시 + 구독 게이트를 얹는다.
// 🔴 캐시 조회가 구독 게이트보다 **먼저**다(2026-09-26, 스펙 §4-4) — 받았던 글은 구독이 끊겨도
//    계속 본다(소급 생성 금지라 "그때 받은 것"이 유일한 원본). 비자격자는 여전히 프로필 조회·
//    LLM 호출 전에 차단된다(원가 0) — 늘어나는 건 캐시 인덱스 조회 1회뿐이다.
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
import { reportDatePolicy } from "@/lib/byeolmaru/report-date";
import { logError, logInfo, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// inline luna 생성 + (파싱 실패 시) 1회 재시도라 최악 2× 호출 — 헤더룸을 명시한다
// (형제 narrative/card-narrative 는 단일 호출이라 미설정).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  try {
    const todayKst = kstDate(new Date().toISOString());
    // ?date= 없으면 오늘. 정책은 lib/byeolmaru/report-date.ts 가 단일 원천(스펙 §4).
    const reqDate = req.nextUrl.searchParams.get("date");
    const reportDate = reqDate ?? todayKst;
    const policy = reportDatePolicy(reportDate, todayKst);
    if (policy === "out_of_range") {
      return NextResponse.json({ error: "date_out_of_range" }, { status: 400 });
    }

    // 🔴 캐시 조회가 자격 검사보다 **앞**이다(2026-09-26, 스펙 §4-4). 받았던 글은 구독이
    //    만료돼도 계속 본다 — 소급 생성이 금지돼 있어 "그때 받은 것"이 유일한 원본이고,
    //    그걸 다시 잠그면 이미 준 것을 뺏는 게 된다. 달력이 이번 달 + 앞뒤 채움(최대 ±6일)만
    //    그리므로 자연히 생긴다(DB 행을 지우지 않는다).
    // 🔴 원가 0 원칙은 안 깨진다 — 비자격자에게 LLM 은 여전히 한 번도 안 불린다.
    //    늘어나는 건 인덱스 읽기 1회뿐이다.
    const cached = await getCachedDailyReport(userId, reportDate);
    if (cached) {
      return NextResponse.json({ report: cached });
    }
    // 과거는 "있던 것만" — 소급 생성하지 않는다(스펙 §4). 그때 받은 글이 아니면 기록이 아니다.
    // 자격과 무관하다 — 이 날짜는 결제해도 글이 나오지 않으니 페이월을 보여줄 자리가 아니다.
    // 🔴 report:null 이면 reason 이 **항상** 붙는다 — "not_generated"(영구·정상)와
    //    "generation_failed"(일시·재시도 가능)는 화면에서 다르게 보여야 한다.
    if (policy === "cache_only") {
      return NextResponse.json({ report: null, reason: "not_generated" });
    }

    // 여기부터 생성 경로(오늘 + 캐시 미스) — 자격 게이트를 프로필 조회·사주 계산보다 먼저 두어
    // 비자격자는 여기서 끝(LLM 은 물론 프로필 조회도 없음 = 원가 0).
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

    // ⚠️ includeMonth 옵션 없이 호출 — app/api/fortune/create/route.ts 의 daily 경로와 동일
    // (includeMonth:true 는 good_days 전용 30일 일진; daily/monthly 는 옵션 없이 호출한다).
    // 🔴 일진은 대상 날짜 기준으로 계산한다 — todayKst 로 계산하면 화면은 9/12 인데 본문은 오늘 일진이 된다.
    const temporal = calcTemporalLuck(baseDateForKst(reportDate), input.year);
    if (!temporal.day) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }
    // 🔴 create/route.ts 처럼 프롬프트 빌드 전에 오늘 일진을 saju 에 붙인다 — sajuBlock 은
    // saju.temporal 이 있을 때만 '오늘 들어온 두 글자' 일진 블록을 넣고, 없으면 {{TODAY_PILLAR}}
    // 가 placeholder("오늘의 일진")로 떨어져 일진 그라운딩이 통째로 빠진다(daily 리포트의 핵심).
    saju.temporal = temporal;

    // 생성 — app/api/fortune/create/route.ts 의 daily 경로와 동일한 프롬프트·모델·파서(+실패 시 1회 재시도).
    // system 은 두 번 다 같으니 지역 클로저로 묶는다. 생성 throw 는 형제 라우트(narrative·card-narrative)
    // 처럼 {report:null} 로 흡수 — 자격자가 상류 blip 에 500 을 보지 않게(calc/DB throw 만 바깥 catch 로 500).
    const logCtx = { route: "/api/byeolmaru/daily-report", userId };
    const system = buildFortuneSystem("daily", { saju, reportDate, todayKst });
    const gen = () =>
      generateOnce(
        system,
        [{ role: "user", content: FORTUNE_KICKOFF }],
        MAX_TOKENS_BY_FORTUNE.daily,
        logCtx,
        fortuneModel("daily"),
        fortuneResponseFormat("daily")
      );

    let ai: ReturnType<typeof parseDailyReportJson> = null;
    try {
      ai = parseDailyReportJson(await gen());
      if (!ai) {
        // 1차 파싱 실패 → 재시도 발화 계측(card-narrative 의 card_parse_retry 와 같은 취지 — §9-5 원가
        // 측정에 "1차 실패→2차 성공"이 완전히 조용해서 이 라우트가 평소 1회 호출인지 2회 호출인지
        // 로그로 구분이 안 됐다).
        await logInfo("daily report parse failed on first attempt — retrying", ctxFromRequest(req, { ...logCtx, extra: { stage: "daily_parse_retry" } }));
        ai = parseDailyReportJson(await gen());
      }
    } catch (err) {
      await logError(err, ctxFromRequest(req, { ...logCtx, extra: { stage: "generate" } }));
      return NextResponse.json({ report: null, reason: "generation_failed" });
    }
    if (!ai) {
      await logError(
        new Error("daily report parse failed"),
        ctxFromRequest(req, { ...logCtx, extra: { stage: "daily_parse" } })
      );
      return NextResponse.json({ report: null, reason: "generation_failed" });
    }

    const report = buildDailyReport(ai, temporal);

    // 캐시 저장은 best-effort — 동시 생성이면 승자를 응답(§11-1-5), 저장 실패면 내 것(다음 요청에서 재생성될 뿐).
    let served = report;
    try {
      served = await saveDailyReport(userId, reportDate, report);
    } catch (err) {
      await logError(err, ctxFromRequest(req, { ...logCtx, extra: { stage: "cache_save" } }));
    }

    return NextResponse.json({ report: served });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/daily-report", userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
