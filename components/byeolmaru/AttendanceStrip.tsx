// components/byeolmaru/AttendanceStrip.tsx — 이번 달 열린 칸 진행 + 연속 방문. P5-2 부터 별 환급이 없다
// (스펙 §10 — 보상은 그날의 운세다. 칸은 방문이 아니라 날짜 경과·구독 자격이 연다).
"use client";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";

interface Props {
  attendance: AttendanceState | null;
  /** 이번 달에 열린 칸 수 = 서버가 내려준 cells 길이(무료는 오늘까지, 구독은 말일까지). */
  filledDays: number;
  /** 구독 자격 여부 — 부연 문구가 자격별로 갈리는 이유는 아래 JSDoc 참고. */
  entitled: boolean;
}

export default function AttendanceStrip({ attendance, filledDays, entitled }: Props) {
  if (!attendance) return null;
  return (
    <section className="rounded-2xl bg-cream-warm px-4 py-3">
      <p className="text-sm font-medium text-eye-purple">
        이번 달 {filledDays}칸 열림
        {attendance.streak > 1 ? ` · ${attendance.streak}일 연속` : ""}
      </p>
      {/* 칸을 여는 건 방문이 아니라 ①구독 자격 ②날짜 경과다(lib/byeolmaru/calendar.ts splitByFreeLine).
          구독자는 첫 진입부터 이번 달 전체가 이미 열려 있어 "매일 오면 열린다"가 그 사람껜 거짓이 되고,
          비구독자는 방문이 아니라 날짜가 칸을 여니 인과가 반대가 된다 — 그래서 자격별로 문구를 가른다.
          비자격 문구는 "내일이 되면"이 아니라 "하루가 지날 때마다"로 쓴다 — 말일엔 다음 날이 다음 달
          1일이라 "한 칸 더 열림"이 아니게 되므로, 말일에도 참인 문장이어야 한다. */}
      <p className="mt-0.5 text-xs text-text-light">
        {entitled ? "구독 중이라 이번 달이 통째로 열려 있어." : "하루가 지날 때마다 한 칸씩 열려."}
      </p>
    </section>
  );
}
