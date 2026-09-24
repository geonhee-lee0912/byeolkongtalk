"use client";

// components/byeolmaru/TodayLead.tsx — 달력 판의 리드 줄.
// 🔴 AttendanceStrip 을 흡수했다. 오늘의 하루 이름이 스트립 칸(74px) 안에서 2줄로 깨지던 걸
//    판 폭(343px)을 쓰는 한 줄로 올린 것이고, 연속 방문은 그 줄의 오른쪽 끝에 붙었다.
//    같은 판에 작은 줄이 둘 쌓이면 잡음이라 하나로 합친다.
import type { AttendanceState } from "@/lib/byeolmaru/attendance";

interface Props {
  /** 오늘의 하루 이름(DAY_NAME). 오늘 칸이 없는 집합이면 null — 그땐 왼쪽을 비운다. */
  todayName: string | null;
  /** 오늘의 표시 점수(백분위 0~100). 없으면 점수를 빼고 이름만 쓴다. */
  todayScore: number | null;
  attendance: AttendanceState | null;
}

export default function TodayLead({ todayName, todayScore, attendance }: Props) {
  // 연속이 1일이면 "연속"이라 부를 게 없다 — 아예 안 그린다.
  const streak = attendance && attendance.streak > 1 ? attendance.streak : null;
  if (!todayName && streak === null) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      {/* 🔴 점수를 여기서도 한 번 말한다 — 칸의 "66점"이 무엇인지 문장으로 받아준다.
          앞부분(오늘 N점)과 하루 이름의 위계를 벌린다 — 한 크기로 쓰면 어디가 머리인지 안 보인다. */}
      <p className="min-w-0 truncate">
        {todayName ? (
          <>
            <span className="text-[16px] font-bold text-eye-purple">
              오늘{todayScore !== null ? ` ${todayScore}점` : ""}
            </span>
            <span className="text-[13px] text-text-light"> · {todayName}</span>
          </>
        ) : null}
      </p>
      {streak !== null && (
        <p className="shrink-0 text-[12px] text-text-light">
          <span className="font-medium text-eye-purple">{streak}일 연속</span> 들르는 중
        </p>
      )}
    </div>
  );
}
