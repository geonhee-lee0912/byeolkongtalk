// 별마루 오늘 개인화 서술 — 자격자(체험/구독)만 LLM 생성, 비자격자는 정적 티저(원가 0).
// 서버 권위: 클라가 보낸 사주·날짜는 받지 않는다. 프로필에서 계산한다(byeolmaru/calendar 와 동일 패턴).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildCalendar } from "@/lib/byeolmaru/calendar";
import { kstDate } from "@/lib/admin-time";
import {
  buildNarrativeSystem,
  buildTeaserLine,
  NARRATIVE_KICKOFF,
  BYEOLMARU_NARRATIVE_MODEL,
  NARRATIVE_MAX_TOKENS,
} from "@/lib/byeolmaru/narrative-prompt";
import { generateOnce } from "@/lib/claude";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  try {
    // 프로필→사주→오늘 셀 계산 — app/api/byeolmaru/calendar/route.ts 와 동일(byte-identical) 패턴.
    // is_primary:true 고정 이유는 그 라우트의 주석 참조(상대 프로필과의 혼선 방지).
    const { data: row, error } = await getServiceSupabase()
      .from("user_profiles")
      .select("birth_date, birth_time, is_lunar_input, is_leap_month, gender")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    if (error) {
      await logError(error, { route: "/api/byeolmaru/narrative", userId });
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    // birth_date 는 P2 부터 nullable(생일 없는 프로필 가능) — 사주 판정은 생일이 필수.
    if (!row || !row.birth_date) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    const input = profileRowToSajuInput(row);
    const saju = calcSaju(input);

    const todayKst = kstDate(new Date().toISOString());
    const temporal = calcTemporalLuck(baseDateForKst(todayKst), input.year, { includeMonth: true });
    if (!temporal.dailyLuck?.length) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }
    const todayCell = buildCalendar(saju, temporal.dailyLuck, todayKst)[0];
    const todayGanji = temporal.day.stem + temporal.day.branch;

    // 자격 판정 — 비자격자는 여기서 끝(LLM 미호출 = 원가 0). 정적 티저만 내려준다.
    const ent = await getEntitlement(userId);
    if (!ent.entitled) {
      return NextResponse.json({ entitled: false, teaser: buildTeaserLine(todayCell) });
    }

    // LLM 생성 실패는 전체 요청 실패가 아니라 티저 폴백으로 흡수 — 위의 calc 가드와는 별개 경계.
    const logCtx = { route: "/api/byeolmaru/narrative", userId };
    try {
      const system = buildNarrativeSystem(saju, todayCell, todayGanji);
      const narrative = await generateOnce(
        system,
        [{ role: "user", content: NARRATIVE_KICKOFF }],
        NARRATIVE_MAX_TOKENS,
        logCtx,
        BYEOLMARU_NARRATIVE_MODEL,
        undefined
      );
      return NextResponse.json({ entitled: true, narrative });
    } catch (err) {
      await logError(err, { ...logCtx, extra: { stage: "generate" } });
      return NextResponse.json({ entitled: true, narrative: null, teaser: buildTeaserLine(todayCell) });
    }
  } catch (err) {
    // calcSaju/calcTemporalLuck 는 tyme4ts 범위 밖 입력이면 throw 한다 — calendar/route.ts 와
    // 동일하게 잡아 남긴다(안 잡으면 /admin/errors 에 흔적이 안 남아 트리아지 불가능해진다).
    await logError(err, { route: "/api/byeolmaru/narrative", userId });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
