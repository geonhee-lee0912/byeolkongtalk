// components/byeolmaru/AttendanceStrip.tsx — 출석 체크인 + 스트릭(전 유저 습관). 보상 진행은 구독자만.
"use client";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";

interface Props {
  attendance: AttendanceState | null;
  loading: boolean;
  onCheckin: () => void;
}

export default function AttendanceStrip({ attendance, loading, onCheckin }: Props) {
  if (!attendance) return null;
  const { checkedInToday, streak, daysThisSub, threshold } = attendance;
  return (
    <section className="flex items-center justify-between rounded-2xl bg-cream-warm px-4 py-3">
      <div>
        <p className="text-sm font-medium text-eye-purple">
          {checkedInToday ? `오늘 출석 완료 · ${streak}일째` : "오늘 아직 출석 안 했어"}
        </p>
        {daysThisSub !== null && (
          <p className="mt-0.5 text-xs text-text-light">
            이번 구독 {daysThisSub}/{threshold}일 · {threshold}일 채우면 10별
          </p>
        )}
      </div>
      {!checkedInToday && (
        <button
          onClick={onCheckin}
          disabled={loading}
          className="rounded-xl bg-gold px-4 py-2 text-sm font-medium text-eye-purple disabled:opacity-60"
        >
          출석하기
        </button>
      )}
    </section>
  );
}
