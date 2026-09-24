"use client";

// components/byeolmaru/TodayLead.tsx — 달력 판의 리드 줄.
// 🔴 AttendanceStrip 을 흡수했다. 오늘의 하루 이름이 스트립 칸(74px) 안에서 2줄로 깨지던 걸
//    판 폭(343px)을 쓰는 한 줄로 올린 것이고, 연속 방문은 그 줄의 오른쪽 끝에 붙었다.
//    같은 판에 작은 줄이 둘 쌓이면 잡음이라 하나로 합친다.
import type { AttendanceState } from "@/lib/byeolmaru/attendance";

interface Props {
  /** 오늘의 하루 이름(DAY_NAME). 오늘 칸이 없는 집합이면 null — 그땐 왼쪽을 비운다. */
  todayName: string | null;
  attendance: AttendanceState | null;
}

export default function TodayLead({ todayName, attendance }: Props) {
  // 연속이 1일이면 "연속"이라 부를 게 없다 — 아예 안 그린다.
  const streak = attendance && attendance.streak > 1 ? attendance.streak : null;
  if (!todayName && streak === null) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <p className="truncate text-[13px] font-medium text-eye-purple">
        {todayName ? `오늘 · ${todayName}` : ""}
      </p>
      {streak !== null && (
        <p className="shrink-0 text-[12px] text-text-light">
          <span className="font-medium text-eye-purple">{streak}일 연속</span> 들르는 중
        </p>
      )}
    </div>
  );
}
