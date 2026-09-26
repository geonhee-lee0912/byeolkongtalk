// 별마루 캘린더 — 이번 달(1일~말일) 판정. 전면 무료(2026-09-26, self·pair 공통) — 룰 100%(LLM 0) → API 원가 0.
// 서버 권위: 클라가 보낸 사주·날짜는 받지 않는다. 프로필에서 계산한다.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { calcSaju, calcTemporalLuck, calcDailyLuckRange, baseDateForKst } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildCalendarPayload, monthRange, gridRange } from "@/lib/byeolmaru/calendar";
import { buildPairCalendar, pairBackdrop } from "@/lib/byeolmaru/pair-day";
import { kstDate } from "@/lib/admin-time";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getEntitlement } from "@/lib/byeolmaru/entitlement";
import { getAttendanceState, recordCheckin } from "@/lib/byeolmaru/attendance";
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
      // 🔴 404 에도 자격을 싣는다 — getEntitlement 는 프로필을 안 보므로 여기서도 계산이 된다.
      //    오늘 타로(/byeolmaru/tarot)는 생일이 필요 없어 프로필 없이도 화면이 떠야 하는데,
      //    자격이 없으면 이미 구독/체험 중인 사람에게 "3일 무료 체험 시작"을 계속 보여주게 된다
      //    (실제로 재현됨). 상태 코드는 404 그대로라 기존 소비처(no_profile 분기)는 무회귀다.
      const ent = await getEntitlement(userId);
      return NextResponse.json(
        { error: "profile_not_found", entitled: ent.entitled, trialUsed: ent.trialUsed },
        { status: 404 }
      );
    }

    const input = profileRowToSajuInput(row);
    const saju = calcSaju(input);

    const todayKst = kstDate(new Date().toISOString());
    // P5-2 — 달력 범위는 "오늘부터 30일"이 아니라 **이번 달 1일~말일**이다(스펙 §6).
    // temporal 은 오늘 간지(todayGanji)만 쓰므로 includeMonth 를 켜지 않는다 — 30일 루프가 낭비다.
    const temporal = calcTemporalLuck(baseDateForKst(todayKst), input.year);
    const { start: monthStart, end: monthEnd } = monthRange(todayKst);
    // 🔴 스트립(오늘 중심 7일)은 2026-09-26 에 삭제됐다 — 09-24 에 마크 칩·동물을 빼면서
    //    격자와 같은 그림이 됐고(실측: 같은 날이 같은 배경색으로 두 번), 남은 역할이었던
    //    "페이월 경계 고정"도 달력이 전면 무료가 되면서 사라졌다. 월 경계는 격자의 앞뒤 달
    //    채움(gridRange, 바로 아래)이 대신한다.
    // 🔴 일진은 격자가 그리는 범위(앞뒤 달 채움 포함)로 계산한다 — monthRange 로만 계산하면
    //    마지막 줄이 휑하고 월 경계에서 앞으로 며칠이 잘린다(삭제된 스트립이 지던 역할).
    //    룰 계산이라 추가 원가는 0이다.
    const { start: gridStart, end: gridEnd } = gridRange(todayKst);
    const gridLuck = calcDailyLuckRange(gridStart, gridEnd);

    // 이번 달 + 앞뒤 채움만큼(달마다 다르다) 보장되지만 tyme4ts 범위 밖 입력이면 빈 배열이 올 수
    // 있다 — 조용히 빈 캘린더를 200 으로 내보내느니 500 으로 터뜨린다.
    if (!gridLuck.length) {
      return NextResponse.json({ error: "calc_failed" }, { status: 500 });
    }

    // 우리 경로 — ?subject=<profileId> (없거나 "me" 는 아래 self 경로 그대로).
    // 소유 검증은 비구독에게도 한다 — .eq("user_id", userId) 라 내가 등록한 상대만 조회되므로
    // 완전 블러 없이도 데이터 누출이 없다. 달력 칸은 전면 무료 — 자격은 리포트 글(daily-report·
    // pair-narrative)과 PaywallCut 만 가른다.
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
      // 🔴 gridLuck 은 월 경계를 넘는다(gridRange) — 안 거르면 pair cells 에 옆 달이 섞이고
      //    WooriTodayView 의 cells[length-1] 폴백이 다음 달을 집는다. 채움은 pair 격자를 그리는
      //    화면이 없으므로 만들지도 내려보내지도 않는다.
      const pairCells = buildPairCalendar(saju, partnerSaju, gridLuck, todayKst)
        .filter((c) => c.date >= monthStart && c.date <= monthEnd);
      const backdrop = pairBackdrop(saju, partnerSaju);
      const todayGanji = temporal.day.stem + temporal.day.branch;
      const ent = await getEntitlement(userId);

      // 관계 유형(썸/연애/짝사랑/헤어진) — watch 행의 성질. 무료 taste 의 relation 슬롯에만 쓰이므로
      // 비자격 분기에서만 읽는다(구독자는 LLM 서술이 pair-narrative 에서 따로 조회한다). 실패해도
      // 캘린더는 떠야 하니 null 폴백(문구만 영향 — score/tags 판정은 무관).
      let status: RelationshipStatus | null = null;
      if (!ent.entitled) {
        const { data: watchRow, error: watchErr } = await getServiceSupabase()
          .from("byeolmaru_watch")
          .select("status")
          .eq("user_id", userId)
          .eq("profile_id", subject)
          .maybeSingle();
        if (watchErr) {
          await logError(watchErr, ctxFromRequest(req, { route: "/api/byeolmaru/calendar", userId, extra: { stage: "watch_status" } }));
        }
        status = (watchRow?.status as RelationshipStatus | null) ?? null;
      }

      return NextResponse.json({
        subject,
        entitled: ent.entitled,
        today: todayKst,
        todayGanji,
        monthStart,
        monthEnd,
        partnerName: pRow.display_name,
        cells: pairCells,
        backdrop,
        // 🔴 무료 문구를 서버가 만들어 내리지 않는다 — 무료도 여러 날을 고를 수 있게 됐으므로
        //    문구는 **선택한 셀 기준**이어야 한다. 클라가 status 와 셀을 받아 getPairTaste(순수)를
        //    직접 돌린다(PAIR_TONE_LABEL·DAY_NAME 과 같은 패턴 — 와이어에 중복을 안 둔다).
        status,
      });
    }

    const ent = await getEntitlement(userId);

    // 🔴 무료선은 2026-09-26 에 폐지됐다 — 달력 칸은 룰 계산(변동비 0)이라 자격과 무관하게 전부
    //    실어 보낸다. 자격이 가르는 건 리포트 글(daily-report 라우트)뿐이다.
    const { cells, fillCells, weeks } = buildCalendarPayload(saju, gridLuck, todayKst);

    // P5-2 — 방문이 곧 출석이다(버튼 폐지). recordCheckin 은 복합 PK upsert 라 멱등이고, 기록 후
    // 최신 상태를 그대로 돌려준다. DB 에러(개별 행 { error })는 recordCheckin/getAttendanceState
    // 내부에서 자체적으로 logError 로 남기고 폴백값으로 삼킨다(supabase-js 는 DB 에러를 throw 하지
    // 않아 여기 catch 로는 안 걸린다) — 이 try/catch 는 getServiceSupabase 초기화 실패 등 그 바깥의
    // 실제 throw 에 대한 방어망이다. 어느 경로든 캘린더는 뜬다(스트릭 반영만 늦을 뿐).
    let attendance;
    try {
      attendance = await recordCheckin(userId, todayKst);
    } catch (e) {
      await logError(e, { route: "/api/byeolmaru/calendar", userId, extra: { stage: "checkin" } });
      attendance = await getAttendanceState(userId, todayKst);
    }

    return NextResponse.json({
      today: todayKst,
      todayGanji: temporal.day.stem + temporal.day.branch,
      monthStart,
      monthEnd,
      cells,
      fillCells,
      weeks,
      entitled: ent.entitled,
      trialUsed: ent.trialUsed,
      subscriptionExpiresAt: ent.subscriptionExpiresAt,
      // 🔴 체험으로 자격을 얻은 사람은 subscriptionExpiresAt 이 **항상 null** 이다
      //    (computeEntitlement 가 reason="trial" 분기에서 그렇게 돌려준다). 배너가 남은 기간을
      //    말하려면 이 필드가 있어야 하고, 없으면 체험자에게만 조용히 빈 칩이 뜬다.
      trialEndsAt: ent.trialEndsAt,
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
