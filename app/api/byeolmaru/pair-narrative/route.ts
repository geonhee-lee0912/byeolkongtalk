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
import { kstDate } from "@/lib/admin-time";
import {
  buildPairNarrativeSystem,
  PAIR_NARRATIVE_KICKOFF,
  BYEOLMARU_NARRATIVE_MODEL,
  NARRATIVE_MAX_TOKENS,
} from "@/lib/byeolmaru/narrative-prompt";
import { generateOnce } from "@/lib/claude";
import { logError, ctxFromRequest } from "@/lib/logger";

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

    const todayKst = kstDate(new Date().toISOString());
    const temporal = calcTemporalLuck(baseDateForKst(todayKst), selfInput.year, { includeMonth: true });
    if (!temporal.dailyLuck?.length) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }
    const cell = buildPairCalendar(selfSaju, partnerSaju, temporal.dailyLuck, todayKst)[0];
    const todayGanji = temporal.day.stem + temporal.day.branch;

    // LLM 생성 실패는 전체 요청 실패가 아니라 narrative:null 로 흡수 — ②-a 와 동일 경계(위 calc 가드와는 별개).
    try {
      const system = buildPairNarrativeSystem(
        selfSaju,
        partnerSaju,
        pairBackdrop(selfSaju, partnerSaju),
        cell,
        todayGanji,
        pRow.display_name ?? "그 사람"
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
