// 별마루 캘린더 — 오늘부터 30일 판정. 룰 100%(LLM 0) → API 원가 0.
// 서버 권위: 클라가 보낸 사주·날짜는 받지 않는다. 프로필에서 계산한다.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildCalendar, weekBuckets } from "@/lib/byeolmaru/calendar";
import { kstDate } from "@/lib/admin-time";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { getAttendanceState, grantDueReward } from "@/lib/byeolmaru/attendance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  try {
    // 내 프로필 = is_primary. user_profiles 는 본인 전용 테이블이 아니다 — 상대(partner) 행도
    // 같은 user_id 로 들어온다(app/api/relationship/route.ts, is_primary:false, 생일 옵션).
    // is_primary 없이 정렬 우선순위만 믿으면, 내 사주는 없고 상대 생일만 입력된 유저에게
    // 상대의 30일 판정을 "네 캘린더"로 내주는 사고가 난다 — 반드시 is_primary:true 로 고정한다
    // (app/api/profiles/route.ts, app/api/readings/route.ts 의 "내 프로필" 조회와 동일 패턴).
    const { data: row, error } = await getServiceSupabase()
      .from("user_profiles")
      .select("birth_date, birth_time, is_lunar_input, is_leap_month, gender")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    if (error) {
      await logError(error, ctxFromRequest(req, { route: "/api/byeolmaru/calendar", userId }));
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
    // includeMonth:true 면 30개가 보장되지만 타입이 그걸 못 담는다 — 조용히 빈 캘린더를
    // 200 으로 내보내느니 500 으로 터뜨린다.
    if (!temporal.dailyLuck?.length) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }
    const cells = buildCalendar(saju, temporal.dailyLuck, todayKst);

    const ent = await getEntitlement(userId);

    // 보상 정산(write)은 best-effort — 실패해도 캘린더는 떠야 한다(로그만 남기고 삼킨다).
    // grantDueReward 는 대개 no-op(만료·미정산 구독 없음).
    try { await grantDueReward(userId); } catch (e) { await logError(e, { route: "/api/byeolmaru/calendar", userId, extra: { stage: "reward" } }); }
    const attendance = await getAttendanceState(userId, todayKst);

    return NextResponse.json({
      today: todayKst,
      todayGanji: temporal.day.stem + temporal.day.branch,
      cells,
      weeks: weekBuckets(cells),
      entitled: ent.entitled,
      trialUsed: ent.trialUsed,
      subscriptionExpiresAt: ent.subscriptionExpiresAt,
      attendance,
    });
  } catch (err) {
    // calcSaju/calcTemporalLuck 는 tyme4ts 범위 밖 입력이면 throw 한다(lib/saju/pairing.ts 의
    // elementRelation unreachable 등). 안 잡으면 UI 는 error 상태로 넘어가지만 /admin/errors 엔
    // 아무것도 안 남아, 하단 탭 화면에서 "아무도 안 씀"과 "일부 코호트에서 계속 터짐"이
    // 구분 불가능해진다. 다른 사주 라우트(consultations/saju/calc 등)와 동일하게 잡아 남긴다.
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/calendar", userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
