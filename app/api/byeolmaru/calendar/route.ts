// 별마루 캘린더 — 오늘부터 30일 판정. 룰 100%(LLM 0) → API 원가 0.
// 서버 권위: 클라가 보낸 사주·날짜는 받지 않는다. 프로필에서 계산한다.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { calcSaju, calcTemporalLuck, calcDailyLuckRange, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildCalendar, weekBuckets, monthRange, splitByFreeLine } from "@/lib/byeolmaru/calendar";
import { buildPairCalendar, pairBackdrop, getPairStaticLine } from "@/lib/byeolmaru/pair-day";
import { kstDate } from "@/lib/admin-time";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { getAttendanceState, grantDueReward } from "@/lib/byeolmaru/attendance";
import type { RelationshipStatus } from "@/lib/relationship/types";

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
    // P5-2 — 달력 범위는 "오늘부터 30일"이 아니라 **이번 달 1일~말일**이다(스펙 §6).
    // temporal 은 오늘 간지(todayGanji)만 쓰므로 includeMonth 를 켜지 않는다 — 30일 루프가 낭비다.
    const temporal = calcTemporalLuck(baseDateForKst(todayKst), input.year);
    const { start: monthStart, end: monthEnd } = monthRange(todayKst);
    const monthLuck = calcDailyLuckRange(monthStart, monthEnd);
    // 28~31개가 보장되지만 tyme4ts 범위 밖 입력이면 빈 배열이 올 수 있다 — 조용히 빈 캘린더를
    // 200 으로 내보내느니 500 으로 터뜨린다.
    if (!monthLuck.length) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }

    // 우리 경로 — ?subject=<profileId> (없거나 "me" 는 아래 self 경로 그대로).
    // 소유 검증은 비구독에게도 한다 — .eq("user_id", userId) 라 내가 등록한 상대만 조회되므로
    // 완전 블러 없이도 데이터 누출이 없다. 자격은 분량으로 가른다(비구독=오늘 1칸, 구독=30일).
    const subject = new URL(req.url).searchParams.get("subject");
    if (subject && subject !== "me") {
      const { data: pRow, error: pErr } = await getServiceSupabase()
        .from("user_profiles")
        .select("birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, display_name")
        .eq("id", subject)
        .eq("user_id", userId)
        .maybeSingle();
      if (pErr) {
        await logError(pErr, ctxFromRequest(req, { route: "/api/byeolmaru/calendar", userId }));
        return NextResponse.json({ error: "internal" }, { status: 500 });
      }
      if (!pRow || pRow.is_primary || !pRow.birth_date) {
        return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
      }

      const partnerSaju = calcSaju(profileRowToSajuInput(pRow));
      // P5-2 — self 경로가 이제 위에서 temporal.dailyLuck 대신 monthLuck(이번 달)을 쓴다.
      // pair 경로 자체의 무료선·응답 모양은 Task 5 몫 — 타입을 맞추기 위한 최소 치환만 한다.
      const pairCells = buildPairCalendar(saju, partnerSaju, monthLuck, todayKst);
      const backdrop = pairBackdrop(saju, partnerSaju);
      const todayGanji = temporal.day.stem + temporal.day.branch;
      const ent = await getEntitlement(userId);

      if (!ent.entitled) {
        // 관계 유형(썸/연애/짝사랑/헤어진) — watch 행의 성질. 정적 한 줄에만 쓰이므로 무료 분기에서만
        // 읽는다(구독자는 아래에서 staticLine 자체를 안 내려 불필요). 실패해도 캘린더는 떠야 하니
        // null 폴백(문구만 영향 — score/tags 판정은 무관, grantDueReward 와 같은 best-effort 결).
        const { data: watchRow, error: watchErr } = await getServiceSupabase()
          .from("byeolmaru_watch")
          .select("status")
          .eq("user_id", userId)
          .eq("profile_id", subject)
          .maybeSingle();
        if (watchErr) {
          await logError(watchErr, ctxFromRequest(req, { route: "/api/byeolmaru/calendar", userId, extra: { stage: "watch_status" } }));
        }
        const status = (watchRow?.status as RelationshipStatus | null) ?? null;

        // 무료 = 오늘 1칸 룰 판정 + 정적 한 줄(30일·LLM 아님). dailyLuck 이 오늘부터라 [0]이 오늘이지만
        // isToday 로 안전하게 찾는다(빈 배열이면 위 calc_failed 가드에서 이미 걸러졌다).
        const todayCell = pairCells.find((c) => c.isToday) ?? pairCells[0];
        return NextResponse.json({
          subject,
          entitled: false,
          today: todayKst,
          todayGanji,
          partnerName: pRow.display_name,
          cells: [todayCell],
          backdrop,
          staticLine: getPairStaticLine(todayCell, status),
        });
      }

      return NextResponse.json({
        subject,
        entitled: true,
        today: todayKst,
        todayGanji,
        partnerName: pRow.display_name,
        cells: pairCells,
        backdrop,
      });
    }

    const ent = await getEntitlement(userId);

    // P5-2 무료선 — 비자격자에겐 안 온 날의 판정을 **직렬화하지 않는다**(날짜만 lockedDates 로).
    const allCells = buildCalendar(saju, monthLuck, todayKst);
    const { open: cells, lockedDates } = splitByFreeLine(allCells, todayKst, ent.entitled);

    // 보상 정산(write)은 best-effort — 실패해도 캘린더는 떠야 한다(로그만 남기고 삼킨다).
    // grantDueReward 는 대개 no-op(만료·미정산 구독 없음).
    try { await grantDueReward(userId); } catch (e) { await logError(e, { route: "/api/byeolmaru/calendar", userId, extra: { stage: "reward" } }); }
    const attendance = await getAttendanceState(userId, todayKst);

    return NextResponse.json({
      today: todayKst,
      todayGanji: temporal.day.stem + temporal.day.branch,
      monthStart,
      monthEnd,
      cells,
      lockedDates,
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
