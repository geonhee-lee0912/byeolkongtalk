// app/api/byeolmaru/today-seen/route.ts — 하단탭 "오늘 거리" 점을 위한 **읽기 전용** 상태.
//
// 🔴 `/api/byeolmaru/calendar` 를 이 용도로 쓰면 안 된다. 거기는 **방문이 곧 출석**이라
//    GET 한 번에 recordCheckin 이 돌아 checkedInToday 가 즉시 true 가 된다(P5-2 설계).
//    하단탭은 전 지면에 깔리므로 그걸 호출하면 아무 페이지만 열어도 출석이 찍히고,
//    그 결과 **점이 영원히 뜨지 않는다**(그리고 출석 스트릭까지 오염된다).
//    여기는 getAttendanceState 만 부르고 아무것도 쓰지 않는다.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { kstDate } from "@/lib/admin-time";
import { getAttendanceState } from "@/lib/byeolmaru/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  // 비로그인은 찍을 근거가 없다 — 점도 안 띄운다(로그인 유도는 별마루 자체 게이트가 한다).
  if (!userId) return NextResponse.json({ seenToday: true });

  const state = await getAttendanceState(userId, kstDate(new Date().toISOString()));
  return NextResponse.json({ seenToday: state.checkedInToday });
}
