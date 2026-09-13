// components/byeolmaru/AttendanceStrip.tsx — 이번 달 채움 진행 + 연속 방문. P5-2 부터 별 환급이 없다
// (스펙 §10 — 보상은 그날의 운세다. 매일 오면 칸이 하나씩 열린다).
"use client";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";

interface Props {
  attendance: AttendanceState | null;
  /** 이번 달에 열린 칸 수 = 서버가 내려준 cells 길이(무료는 오늘까지, 구독은 말일까지). */
  filledDays: number;
}

export default function AttendanceStrip({ attendance, filledDays }: Props) {
  if (!attendance) return null;
  return (
    <section className="rounded-2xl bg-cream-warm px-4 py-3">
      <p className="text-sm font-medium text-eye-purple">
        이번 달 {filledDays}칸 채움
        {attendance.streak > 1 ? ` · ${attendance.streak}일 연속` : ""}
      </p>
      <p className="mt-0.5 text-xs text-text-light">매일 오면 그날 칸이 하나씩 열려.</p>
    </section>
  );
}
