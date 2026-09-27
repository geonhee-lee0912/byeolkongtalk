// 별마루 우리 오늘 서술 — 자격자만 nano 생성(비자격 미호출=원가0). ②-a narrative(app/api/byeolmaru/narrative)
// 의 entitlement-gate-before-LLM + try/catch 티저(여기선 null) 폴백 패턴을 미러.
// ?subject 파트너 조회+검증은 app/api/byeolmaru/calendar/route.ts 와 동일 패턴(소유+비-self+생일 확인).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildPairCalendar, pairBackdrop } from "@/lib/byeolmaru/pair-day";
import { monthRange } from "@/lib/byeolmaru/calendar";
import { kstDate } from "@/lib/admin-time";
import {
  buildPairNarrativeSystem,
  PAIR_NARRATIVE_KICKOFF,
  PAIR_REPORT_MODEL,
  PAIR_NARRATIVE_MAX_TOKENS,
} from "@/lib/byeolmaru/narrative-prompt";
import { generateOnce } from "@/lib/claude";
import { getCachedPairNarrative, getPairNarrativeByDate, savePairNarrative, countPairReportsOn } from "@/lib/byeolmaru/pair-narrative";
import { reportDatePolicy } from "@/lib/byeolmaru/report-date";
import { PAIR_REPORT_DAILY_LIMIT } from "@/lib/byeolmaru/constants";
import { PAIR_REPORT_SCHEMA, parsePairReportJson, buildPairReport } from "@/lib/byeolmaru/pair-report";
import { logError, logInfo, ctxFromRequest } from "@/lib/logger";
import type { RelationshipStatus } from "@/lib/relationship/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  const subject = new URL(req.url).searchParams.get("subject");

  const logCtx = { route: "/api/byeolmaru/pair-narrative", userId };
  try {
    const todayKst = kstDate(new Date().toISOString());
    // ?date= 없으면 오늘. 정책은 lib/byeolmaru/report-date.ts 가 단일 원천(daily-report 와 같은 패턴).
    // subject 와 같은 방식으로 파싱한다 — 이 파일은 req.nextUrl 이 아니라 new URL(req.url) 을 쓴다.
    const reqDate = new URL(req.url).searchParams.get("date");
    const reportDate = reqDate ?? todayKst;
    const policy = reportDatePolicy(reportDate, todayKst);
    if (policy === "out_of_range") {
      return NextResponse.json({ error: "date_out_of_range" }, { status: 400 });
    }

    // 🔴 과거는 **자격 검사보다 앞**에서 끝낸다(스펙 §4-1). 받았던 글은 구독이 만료돼도 계속
    //    본다 — 소급 생성이 금지돼 있어 "그때 받은 것"이 유일한 원본이고, 그걸 다시 잠그면
    //    이미 준 것을 뺏는 게 된다. 사주 daily-report 가 2026-09-26 에 같은 이유로 이 순서가 됐다.
    // 🔴 그리고 지금 걸어둔 상대(subject)로 묻지 않는다 — 그날 본 상대를 기록에서 찾는다.
    //    그래서 이 분기는 subject 없이 끝난다 — 아래 subject_required 가드는 이 분기 뒤로 옮겼다
    //    (과거 조회는 상대를 몰라도 되는 게 설계 의도 — lib/byeolmaru/pair-narrative.ts 의
    //    getPairNarrativeByDate 머리 주석 참조. WooriTodayView 는 항상 subject 를 보내는 오늘
    //    전용 화면이라 이 이동으로 회귀하지 않는다).
    if (policy === "cache_only") {
      const past = await getPairNarrativeByDate(userId, reportDate);
      return NextResponse.json(
        past
          ? { entitled: true, narrative: past.report, partnerProfileId: past.partnerProfileId }
          : { entitled: true, narrative: null, reason: "no_record" }
      );
    }

    // 여기부터 오늘(generate) 경로다 — subject 는 여기서부터만 쓰인다.
    if (!subject) return NextResponse.json({ error: "subject_required" }, { status: 400 });

    // 자격 판정 먼저 — 비자격자는 프로필 조회조차 하지 않는다(원가 0, calendar 의 subject 분기와 동일 순서).
    const ent = await getEntitlement(userId);
    if (!ent.entitled) return NextResponse.json({ entitled: false }, { status: 403 });

    // 🔴 캐시는 자격 게이트 **뒤**, 프로필/사주 계산 **앞**이다. 비자격자는 캐시도 프로필도 안 읽고
    //    바로 위 403 에서 끊긴다(LLM 원가 0 — getEntitlement 자체의 조회는 어차피 모든 요청이 한다),
    //    자격자는 히트 시 calcSaju·일진·watch 조회를 통째로 건너뛴다(생성 실측 5.1초 → DB 1회).
    //    남의 상대 id 를 넣어도 키가 (내 user_id, 그 id) 라 행이 없어 자연히 미스 → 아래 소유 검증으로 간다.
    const cached = await getCachedPairNarrative(userId, subject, todayKst);
    if (cached) return NextResponse.json({ entitled: true, narrative: cached });

    // 🔴 하루 상한 — 캐시 **미스 뒤, 사주 계산·LLM 앞**이다. 이 순서가 전부다:
    //    ①이미 본 상대로 되돌아가는 건 위 캐시 히트에서 이미 빠져나가 상한을 안 탄다(원가 0)
    //    ②막을 땐 calcSaju·일진·watch 조회까지 통째로 건너뛴다.
    //    근거·수치는 PAIR_REPORT_DAILY_LIMIT 주석.
    // 🔴 **fail-closed** — 카운트 조회가 실패하면(null) 생성하지 않는다. 0으로 접으면 DB 장애 때
    //    원가 가드가 조용히 사라진다. 유저에겐 상한과 같은 안내가 나가고 다음 요청에서 복구된다.
    const usedToday = await countPairReportsOn(userId, todayKst);
    if (usedToday === null || usedToday >= PAIR_REPORT_DAILY_LIMIT) {
      return NextResponse.json({ entitled: true, narrative: null, reason: "daily_limit" });
    }

    const supa = getServiceSupabase();
    const { data: selfRow, error: selfErr } = await supa
      .from("user_profiles")
      .select("birth_date, birth_time, is_lunar_input, is_leap_month, gender")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (selfErr) {
      await logError(selfErr, ctxFromRequest(req, logCtx));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    if (!selfRow?.birth_date) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

    const { data: pRow, error: pErr } = await supa
      .from("user_profiles")
      .select("birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, display_name")
      .eq("id", subject)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr) {
      await logError(pErr, ctxFromRequest(req, logCtx));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    if (!pRow || pRow.is_primary || !pRow.birth_date) {
      return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
    }

    const selfInput = profileRowToSajuInput(selfRow);
    const selfSaju = calcSaju(selfInput);
    const partnerSaju = calcSaju(profileRowToSajuInput(pRow));

    // 관계 유형(썸/연애/짝사랑/헤어진) — watch 행의 성질. 실패해도 서술은 떠야 하니 null 폴백
    // (프롬프트에 관계 라인만 안 붙을 뿐 무회귀 — calendar/route.ts 의 watch_status 조회와 동일 패턴).
    const { data: watchRow, error: watchErr } = await supa
      .from("byeolmaru_watch")
      .select("status")
      .eq("user_id", userId)
      .eq("profile_id", subject)
      .maybeSingle();
    if (watchErr) {
      await logError(watchErr, { ...logCtx, extra: { stage: "watch_status" } });
    }
    const status = (watchRow?.status as RelationshipStatus | null) ?? null;

    const temporal = calcTemporalLuck(baseDateForKst(todayKst), selfInput.year, { includeMonth: true });
    if (!temporal.dailyLuck?.length) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }
    const pairCal = buildPairCalendar(selfSaju, partnerSaju, temporal.dailyLuck, todayKst);
    const cell = pairCal[0];
    // 택일 보완①: 이번 달 중 둘 사이 '좋은 날' 상위 3개를 서술에 넘겨 관계-타이밍으로 짚게 한다.
    // 🔴 I-4 정정 — 일진 계산 자체(위 includeMonth:true)는 그대로 앞으로 30일 창이지만(오늘 셀만
    //    여기서 쓴다), 달력 UI 는 이번 달 말일에서 끊기고 다음 달로 넘기는 화면이 없다. 그래서
    //    goodDays 후보만 이번 달 말일까지로 클램프한다 — 안 그러면 구독자가 달력에서 찾을 수 없는
    //    다음 달 날짜를 추천받는다(달력 범위 자체의 클램프는 그룹 B/calendar.ts 몫, 여긴 필터만).
    const { end: monthEnd } = monthRange(todayKst);
    const goodDays = pairCal.filter((c) => c.tone === "good" && c.date <= monthEnd).slice(0, 3);
    const todayGanji = temporal.day.stem + temporal.day.branch;

    // LLM 생성 실패는 전체 요청 실패가 아니라 narrative:null 로 흡수 — ②-a 와 동일 경계(위 calc 가드와는 별개).
    try {
      const system = buildPairNarrativeSystem(
        selfSaju,
        partnerSaju,
        pairBackdrop(selfSaju, partnerSaju),
        cell,
        todayGanji,
        pRow.display_name ?? "그 사람",
        goodDays,
        status
      );
      // 🔴 구조화 출력(strict json_schema) — 형식 위반이 디코딩 단계에서 구조적으로 불가능해진다.
      //    card-narrative 가 이 방식으로 파싱 실패 0/12 를 얻었다(P6-2 실측).
      const gen = () =>
        generateOnce(
          system,
          [{ role: "user", content: PAIR_NARRATIVE_KICKOFF }],
          PAIR_NARRATIVE_MAX_TOKENS,
          logCtx,
          PAIR_REPORT_MODEL,
          { name: "pair_report", schema: PAIR_REPORT_SCHEMA }
        );
      const raw = await gen();
      let ai = parsePairReportJson(raw);
      if (!ai && raw) {
        // 1차 파싱 실패(빈 응답이 아님 = 잘림/형식 이탈) → 재시도 발화 계측. card-narrative 와 같은 이유:
        // "1차 실패→2차 성공"이 조용하면 이 라우트가 평소 1회 호출인지 2회 호출인지 로그로 구분이 안 된다(원가 측정 전제).
        await logInfo("pair report parse failed on first attempt — retrying", { ...logCtx, extra: { stage: "pair_parse_retry" } });
        ai = parsePairReportJson(await gen());
      }
      // 빈 응답은 재시도해도 같다 — streamChat 이 이미 내부적으로 재시도한 뒤의 결과다(raw === "").
      if (!ai) {
        await logError(new Error(raw ? "pair report parse failed" : "empty pair report"), {
          ...logCtx,
          extra: { stage: raw ? "pair_parse" : "generate_empty" },
        });
        return NextResponse.json({ entitled: true, narrative: null });
      }
      const report = buildPairReport(ai);
      // 캐시 저장은 best-effort — 실패해도 이미 만든 리포트는 그대로 응답한다(daily-report 와 동일 경계).
      // 동시 생성이면 승자를 응답한다(§11-1-5) — 저장 실패는 내 것 그대로(다음 요청에서 재생성될 뿐).
      let served = report;
      try {
        served = await savePairNarrative(userId, subject, todayKst, report);
      } catch (e) {
        await logError(e, { ...logCtx, extra: { stage: "cache_save" } });
      }
      return NextResponse.json({ entitled: true, narrative: served });
    } catch (err) {
      await logError(err, { ...logCtx, extra: { stage: "generate" } });
      return NextResponse.json({ entitled: true, narrative: null });
    }
  } catch (err) {
    // calcSaju/calcTemporalLuck 는 tyme4ts 범위 밖 입력이면 throw 한다 — calendar/route.ts 와 동일하게 잡아 남긴다.
    await logError(err, ctxFromRequest(req, logCtx));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
