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
  BYEOLMARU_NARRATIVE_MODEL,
  NARRATIVE_MAX_TOKENS,
} from "@/lib/byeolmaru/narrative-prompt";
import { generateOnce } from "@/lib/claude";
import { logError, ctxFromRequest } from "@/lib/logger";
import type { RelationshipStatus } from "@/lib/relationship/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  const subject = new URL(req.url).searchParams.get("subject");
  if (!subject) return NextResponse.json({ error: "subject_required" }, { status: 400 });

  const logCtx = { route: "/api/byeolmaru/pair-narrative", userId };
  try {
    // 자격 판정 먼저 — 비자격자는 프로필 조회조차 하지 않는다(원가 0, calendar 의 subject 분기와 동일 순서).
    const ent = await getEntitlement(userId);
    if (!ent.entitled) return NextResponse.json({ entitled: false }, { status: 403 });

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

    const todayKst = kstDate(new Date().toISOString());
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
      const narrative = await generateOnce(
        system,
        [{ role: "user", content: PAIR_NARRATIVE_KICKOFF }],
        NARRATIVE_MAX_TOKENS,
        logCtx,
        BYEOLMARU_NARRATIVE_MODEL,
        undefined
      );
      // generateOnce 는 빈/거부 완성 시 throw 가 아니라 "" 를 반환한다(streamChat 자체 재시도 후에도).
      if (!narrative) {
        await logError(new Error("empty pair narrative"), { ...logCtx, extra: { stage: "generate_empty" } });
        return NextResponse.json({ entitled: true, narrative: null });
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
