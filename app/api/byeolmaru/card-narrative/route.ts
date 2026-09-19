// 별마루 오늘의 카드 서술 — 자격자만 nano 생성(비자격 미호출=원가0). ②-a narrative(app/api/byeolmaru/narrative)
// 의 entitlement-gate-before-LLM + try/catch 티저(여기선 null) 폴백 패턴을 미러(pair-narrative 와 동일 구조).
// 카드 자체(cardId/reversed)는 이 라우트가 뽑지 않는다 — byeolmaru_daily_card 에 이미 기록된 오늘 카드를
// 읽어서 사주 위에 얹을 뿐이다(뽑기는 /api/byeolmaru/daily-card POST 전담).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { getTodayCard } from "@/lib/byeolmaru/daily-card";
import { getCard } from "@/lib/tarot/cards";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { STEM_ELEMENT } from "@/lib/saju/pairing";
import { toDaySelf } from "@/lib/byeolmaru/calendar";
import { dayFactors, dayScore, dayGrade, axisScores } from "@/lib/byeolmaru/day-score";
import { kstDate } from "@/lib/admin-time";
import {
  buildCardNarrativeSystem,
  CARD_NARRATIVE_KICKOFF,
  BYEOLMARU_NARRATIVE_MODEL,
  CARD_NARRATIVE_MAX_TOKENS,
} from "@/lib/byeolmaru/narrative-prompt";
import { generateOnce } from "@/lib/claude";
import { getCachedCardNarrative, saveCardNarrative } from "@/lib/byeolmaru/card-narrative";
import { logError, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  const logCtx = { route: "/api/byeolmaru/card-narrative", userId };
  try {
    // 자격 판정 먼저 — 비자격자는 오늘의 카드 조회조차 하지 않는다(원가 0, pair-narrative 와 동일 순서).
    const ent = await getEntitlement(userId);
    if (!ent.entitled) return NextResponse.json({ entitled: false }, { status: 403 });

    const todayKst = kstDate(new Date().toISOString());

    // 캐시 히트 — (유저,오늘) 해석이 이미 있으면 재생성 없이 반환. 자격 게이트 뒤라 비자격자는 여기 못 온다.
    const cached = await getCachedCardNarrative(userId, todayKst);
    if (cached) return NextResponse.json({ entitled: true, narrative: cached });

    const drawn = await getTodayCard(userId, todayKst);
    if (!drawn) return NextResponse.json({ entitled: true, narrative: null }); // 아직 오늘 카드를 안 뽑음
    const tarotCard = getCard(drawn.cardId);
    if (!tarotCard) return NextResponse.json({ entitled: true, narrative: null });

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
    // dailyLuck(30일)은 이 라우트가 안 쓴다 — 오늘 일진(temporal.day)만 필요해 includeMonth 를 안 켠다
    // (narrative/pair-narrative 는 todayCell/buildPairCalendar 용으로 dailyLuck 이 필요해 켠 것과 다름).
    const temporal = calcTemporalLuck(baseDateForKst(todayKst), input.year);
    const todayGanji = temporal.day.stem + temporal.day.branch;
    // 오늘 사주 흐름(등급·축) — 캘린더 today 셀과 동일 계산(toDaySelf+dayFactors, 순수·₩0). 유료 카드
    // 서술이 카드를 "오늘 애정/일" 축에 얹으려면 필요. temporal.day 엔 element 가 없어 천간→오행 매핑으로 보충.
    const f = dayFactors(toDaySelf(saju), {
      stem: temporal.day.stem,
      branch: temporal.day.branch,
      element: STEM_ELEMENT[temporal.day.stem],
    });
    const grade = dayGrade(dayScore(f));
    const axes = axisScores(f);

    // LLM 생성 실패는 전체 요청 실패가 아니라 narrative:null 로 흡수 — ②-a 와 동일 경계(위 calc 가드와는 별개).
    try {
      const system = buildCardNarrativeSystem(saju, tarotCard, drawn.reversed, todayGanji, grade, axes);
      const narrative = await generateOnce(
        system,
        [{ role: "user", content: CARD_NARRATIVE_KICKOFF }],
        CARD_NARRATIVE_MAX_TOKENS,
        logCtx,
        BYEOLMARU_NARRATIVE_MODEL,
        undefined
      );
      // generateOnce 는 빈/거부 완성 시 throw 가 아니라 "" 를 반환한다(streamChat 자체 재시도 후에도).
      if (!narrative) {
        await logError(new Error("empty card narrative"), { ...logCtx, extra: { stage: "generate_empty" } });
        return NextResponse.json({ entitled: true, narrative: null });
      }
      // 캐시 저장은 best-effort — 실패해도 이미 만든 해석은 그대로 응답한다(daily-report 와 동일 규율).
      try {
        await saveCardNarrative(userId, todayKst, narrative);
      } catch (e) {
        await logError(e, { ...logCtx, extra: { stage: "cache_save" } });
      }
      return NextResponse.json({ entitled: true, narrative });
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
