"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";
import { pickCrossSell } from "@/lib/byeolmaru/crosssell";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import DailyCardBlock from "./DailyCardBlock";
import AttendanceStrip from "./AttendanceStrip";
import CrossSellCard from "./CrossSellCard";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  weeks: WeekBucket[];
  entitled: boolean;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
  attendance: AttendanceState;
}

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; data: CalendarResponse };

const DOT: Record<string, string> = { good: "bg-gold", normal: "bg-lilac", caution: "bg-lilac-mid" };

export default function ByeolmaruHub() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
      if (res.status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      if (res.status === 404) { trackUiEvent("byeolmaru_no_profile"); setState({ kind: "no_profile" }); return; }
      if (!res.ok) { setState({ kind: "error" }); return; }
      const data: CalendarResponse = await res.json();
      if (data.cells.length === 0) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", data });
      setAttendance(data.attendance);
    } catch { setState({ kind: "error" }); }
  }
  useEffect(() => { void refresh(); }, []);

  const { startTrial, openSubscribe, subscribeModal } = useByeolmaruSubscribe(refresh);

  async function handleCheckin() {
    trackUiEvent("byeolmaru_checkin", { meta: { streak: attendance?.streak ?? 0 } });
    setCheckinLoading(true);
    try {
      const r = await fetch("/api/byeolmaru/checkin", { method: "POST" });
      const j = await r.json();
      if (j.attendance) setAttendance(j.attendance);
    } finally { setCheckinLoading(false); }
  }

  if (state.kind === "loading") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">별마루를 펼치고 있어…</main>;
  if (state.kind === "need_login") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">로그인하면 오늘을 펼쳐줄게.</p>
      <Link href="/login?next=/byeolmaru" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">로그인하러 가기</Link>
    </main>
  );
  if (state.kind === "no_profile") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">생년월일을 알려주면 오늘을 그려줄게.</p>
      <Link href="/mypage" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">생년월일 입력하러 가기</Link>
    </main>
  );
  if (state.kind === "error") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">지금은 별마루를 못 펼쳤어. 잠시 뒤에 다시 와줄래?</main>;

  const { data } = state;
  const todayCell = data.cells.find((c) => c.isToday) ?? data.cells[0];
  const week = data.cells.slice(0, 7);
  const crossSell = pickCrossSell(todayCell);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">오늘 들어온 두 글자 · {data.todayGanji}</p>
      </header>

      <AttendanceStrip attendance={attendance} loading={checkinLoading} onCheckin={handleCheckin} />

      <Link href="/byeolmaru/saju" className="block rounded-2xl bg-cream-warm p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-display text-base text-eye-purple">🗓 오늘 사주</span>
          <span className="font-display text-lg text-eye-purple">{todayCell.grade.label}</span>
        </div>
        <div className="mb-2 flex gap-1.5">
          {week.map((c) => (
            <div key={c.date} className={`h-2.5 flex-1 rounded-full ${DOT[c.grade.tone] ?? "bg-lilac-soft"} ${c.isToday ? "ring-2 ring-lilac-deep" : ""}`} />
          ))}
        </div>
        <p className="text-xs text-lilac-deep">이번 주 흐름 · 30일 전체 보기 →</p>
      </Link>

      <DailyCardBlock entitled={data.entitled} trialUsed={data.trialUsed} onStartTrial={startTrial} onSubscribe={openSubscribe} />

      <div className="grid grid-cols-2 gap-3">
        <Link href="/byeolmaru/woori" className="rounded-2xl bg-cream-warm p-4 text-center">
          <div className="font-display text-base text-eye-purple">💞 우리 오늘</div>
          <div className="mt-1 text-xs text-text-light">그 사람과 나</div>
        </Link>
        <Link href="/fortune/saju-mbti" className="rounded-2xl bg-cream-warm p-4 text-center">
          <div className="font-display text-base text-eye-purple">🧭 사주 MBTI</div>
          <div className="mt-1 text-xs text-text-light">내 유형</div>
        </Link>
        <Link href="/fortune/byeoljari" className="rounded-2xl bg-cream-warm p-4 text-center">
          <div className="font-display text-base text-eye-purple">✨ 별 인연 지도</div>
          <div className="mt-1 text-xs text-text-light">인연 별자리</div>
        </Link>
      </div>

      <CrossSellCard item={crossSell} />
      {subscribeModal}
    </main>
  );
}
