// components/byeolmaru/AttendanceStrip.tsx — 연속 방문만. 칸 채움 서사("이번 달 N칸 열림")는
// 월간 격자 접힘 버튼(MonthGridSection)이 가져갔다(스펙 §2-2) — 두 자리에 같은 문구를 두지 않는다.
// P5-2 부터 별 환급은 없다(보상은 그날의 운세다).
"use client";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";

export default function AttendanceStrip({ attendance }: { attendance: AttendanceState | null }) {
  // 연속이 1일이면 "연속"이라 부를 게 없다 — 아예 안 그린다(빈 띠가 자리만 먹는 걸 막는다).
  if (!attendance || attendance.streak <= 1) return null;
  return (
    <p className="px-1 text-[12px] text-text-light">
      <span className="font-medium text-eye-purple">{attendance.streak}일 연속</span> 들르는 중이야
    </p>
  );
}
