// 별마루 오늘 타로 7블록 리포트(유료) — 자격자만 luna 생성(비자격 미호출=원가0).
// P6-2(스펙 2026-09-19 §6): 자유 줄글 narrative → 7블록 CardReport(JSON 구조화 + 사주 축 위 카드 게이지).
// 카드 자체(cardId/reversed)는 이 라우트가 뽑지 않는다 — byeolmaru_daily_card 에 이미 기록된 오늘 카드를 읽어 사주 위에 얹을 뿐이다.
// 🔴 파싱·검증·게이지 병합은 저장 전 한 번(§11-1-4) — 캐시 히트는 저장본을 그대로 돌려준다(응답 대칭).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { getCardOn } from "@/lib/byeolmaru/daily-card";
import { getCard } from "@/lib/tarot/cards";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { STEM_ELEMENT } from "@/lib/saju/pairing";
import { toDaySelf } from "@/lib/byeolmaru/calendar";
import { dayFactors, dayScore, dayGrade, axisScores } from "@/lib/byeolmaru/day-score";
import { cardGauge } from "@/lib/byeolmaru/card-gauge";
import { getCardTaste } from "@/lib/byeolmaru/static-lines";
import { kstDate } from "@/lib/admin-time";
import {
  buildCardReportSystem,
  CARD_REPORT_KICKOFF,
  CARD_REPORT_MODEL,
  CARD_REPORT_MAX_TOKENS,
} from "@/lib/byeolmaru/narrative-prompt";
import { CARD_REPORT_SCHEMA, parseCardReportJson, buildCardReport } from "@/lib/byeolmaru/card-report";
import { generateOnce } from "@/lib/claude";
import { getCachedCardReport, saveCardReport } from "@/lib/byeolmaru/card-narrative";
import { logError, logInfo, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// luna 생성 — 파싱 실패(빈 응답이 아닌데 JSON 이 아님) 시 1회 재시도, 빈 응답은 재시도하지 않는다(1B).
// streamChat 자체가 내부적으로 최대 2회(MAX_ATTEMPTS) 재시도하므로 실제 최악은
// 2(파싱 재시도) × 2(streamChat 내부 재시도) = 최악 4× 업스트림 호출 — daily-report 와 같은 헤더룸.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  const logCtx = { route: "/api/byeolmaru/card-narrative", userId };
  try {
    // 자격 판정 먼저 — 비자격자는 오늘의 카드 조회조차 하지 않는다(원가 0).
    const ent = await getEntitlement(userId);
    if (!ent.entitled) return NextResponse.json({ entitled: false }, { status: 403 });

    const todayKst = kstDate(new Date().toISOString());

    // 캐시 히트 — 저장본 그대로(파싱·게이지는 저장 전에 끝났다).
    const cached = await getCachedCardReport(userId, todayKst);
    if (cached) return NextResponse.json({ entitled: true, report: cached });

    // report:null 은 항상 reason 을 동반한다 — not_drawn(영구·정상)과 generation_failed(일시·재시도
    // 가능)를 DailyCardBlock 이 다르게 보여줘야 한다(daily-report.ts 형제 규율과 동일).
    const drawn = await getCardOn(userId, todayKst);
    if (!drawn) return NextResponse.json({ entitled: true, report: null, reason: "not_drawn" }); // 아직 오늘 카드를 안 뽑음
    const tarotCard = getCard(drawn.cardId);
    if (!tarotCard) {
      // 카드 마스터 불일치 — 유저에겐 "안 뽑음"과 같은 뜻이지만 데이터 파손이니 조용히 지나가면 안 된다.
      await logError(new Error("daily card id not in tarot master"), {
        ...logCtx,
        extra: { stage: "card_master_mismatch", cardId: drawn.cardId },
      });
      return NextResponse.json({ entitled: true, report: null, reason: "not_drawn" });
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

    const input = profileRowToSajuInput(selfRow);
    const saju = calcSaju(input);
    // 오늘 일진만 필요(dailyLuck 30일 불필요 → includeMonth 안 켠다).
    const temporal = calcTemporalLuck(baseDateForKst(todayKst), input.year);
    const todayGanji = temporal.day.stem + temporal.day.branch;
    // 오늘 사주 축 — 캘린더 today 셀과 동일 계산(순수·₩0). 게이지의 회색 바탕이자 프롬프트 그라운딩.
    const f = dayFactors(toDaySelf(saju), {
      stem: temporal.day.stem,
      branch: temporal.day.branch,
      element: STEM_ELEMENT[temporal.day.stem],
    });
    const grade = dayGrade(dayScore(f));
    const axes = axisScores(f);
    const gauge = cardGauge(axes, tarotCard, drawn.reversed);
    // 화면에 이미 뜬 무료 taste(DailyCardBlock 과 같은 시드 = 오늘) — 역할분리(§6-4)용으로 프롬프트에 넣는다.
    const freeTaste = getCardTaste(drawn.cardId, drawn.reversed, todayKst);

    // LLM 생성 실패는 전체 요청 실패가 아니라 report:null 로 흡수(형제 라우트와 동일 경계).
    try {
      const system = buildCardReportSystem({
        saju, card: tarotCard, reversed: drawn.reversed, todayGanji, todayKst, grade, axes, gauge, freeTaste,
      });
      const gen = () =>
        generateOnce(
          system,
          [{ role: "user", content: CARD_REPORT_KICKOFF }],
          CARD_REPORT_MAX_TOKENS,
          logCtx,
          CARD_REPORT_MODEL,
          { name: "card_report", schema: CARD_REPORT_SCHEMA }
        );
      const raw = await gen();
      let ai = parseCardReportJson(raw);
      if (!ai && raw) {
        // 1차 파싱 실패(빈 응답이 아님 = 잘림/형식 이탈) → 재시도 발화 계측. "1차 실패→2차 성공"이 완전히
        // 조용해서 이 라우트가 평소 1회 호출인지 2회 호출인지 로그로 구분이 안 됐다(§9-5 원가 측정 전제).
        await logInfo("card report parse failed on first attempt — retrying", { ...logCtx, extra: { stage: "card_parse_retry" } });
        ai = parseCardReportJson(await gen());
      }
      // 빈 응답은 재시도해도 같다 — streamChat 이 이미 내부적으로 재시도한 뒤의 결과다(raw === "").
      if (!ai) {
        await logError(new Error(raw ? "card report parse failed" : "empty card report"), {
          ...logCtx,
          extra: { stage: raw ? "card_parse" : "generate_empty" },
        });
        return NextResponse.json({ entitled: true, report: null, reason: "generation_failed" });
      }
      const report = buildCardReport(ai, { cardId: drawn.cardId, reversed: drawn.reversed, gauge });
      // 저장은 best-effort — 동시 생성이면 승자를 응답(§11-1-5), 저장 실패면 내 것(다음 요청에서 재생성될 뿐).
      let served = report;
      try {
        served = await saveCardReport(userId, todayKst, report);
      } catch (e) {
        await logError(e, { ...logCtx, extra: { stage: "cache_save" } });
      }
      return NextResponse.json({ entitled: true, report: served });
    } catch (err) {
      await logError(err, { ...logCtx, extra: { stage: "generate" } });
      return NextResponse.json({ entitled: true, report: null, reason: "generation_failed" });
    }
  } catch (err) {
    // calcSaju/calcTemporalLuck 는 tyme4ts 범위 밖 입력이면 throw — calendar/route.ts 와 동일하게 잡아 남긴다.
    await logError(err, ctxFromRequest(req, logCtx));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
