"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import type { DailyReport } from "@/lib/fortune/daily-report";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import DailyReportCard from "@/components/fortune/DailyReportCard";
import CalendarGrid, { type GridCell } from "./CalendarGrid";
import DayDetailCard from "./DayDetailCard";
import PremiumBlock from "./PremiumBlock";
import BackHeader from "./BackHeader";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  weeks: WeekBucket[];
  entitled: boolean;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
}

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; data: CalendarResponse };

function fmtMD(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}


export default function SajuTodayView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
      if (res.status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      if (res.status === 404) { trackUiEvent("byeolmaru_no_profile"); setState({ kind: "no_profile" }); return; }
      if (!res.ok) { setState({ kind: "error" }); return; }
      const data: CalendarResponse = await res.json();
      if (data.cells.length === 0) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", data });
      setSelected((prev) => prev ?? data.today);

      // 리포트는 자격자에게만 — 비자격자는 daily-report 를 아예 호출하지 않는다(403 방지=원가0).
      if (data.entitled) {
        setReportLoading(true);
        try {
          const rRes = await fetch("/api/byeolmaru/daily-report", { cache: "no-store" });
          const j = await rRes.json();
          setReport(j.report ?? null);
        } catch {
          setReport(null);
        }
        setReportLoading(false);
      } else {
        setReport(null);
        setReportLoading(false);
      }
    } catch { setState({ kind: "error" }); return; }
  }

  useEffect(() => { void refresh(); }, []);

  const { startTrial, openSubscribe, subscribeModal } = useByeolmaruSubscribe(refresh);

  if (state.kind === "loading") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">펼치는 중…</main>;
  if (state.kind === "need_login") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">로그인하면 네 달력을 펼쳐줄게.</p>
      <Link href="/login?next=/byeolmaru/saju" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">로그인하러 가기</Link>
    </main>
  );
  if (state.kind === "no_profile") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">생년월일을 알려주면 네 달력을 그려줄게.</p>
      <Link href="/mypage" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">생년월일 입력하러 가기</Link>
    </main>
  );
  if (state.kind === "error") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">지금은 못 펼쳤어. 잠시 뒤에 다시 와줄래?</main>;

  const { data } = state;
  const cell = data.cells.find((c) => c.date === selected) ?? data.cells[0];
  const selfGridCells: GridCell[] = data.cells.map((c) => ({
    date: c.date, ganji: c.ganji, tone: c.grade.tone, label: c.grade.label, isToday: c.isToday,
  }));
  const good = data.weeks.reduce((s, w) => s + w.good, 0);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <BackHeader title="오늘 사주" />
      <section aria-label="30일 캘린더">
        <CalendarGrid cells={selfGridCells} selectedDate={cell.date} onSelect={setSelected} />
      </section>
      {good > 0 ? (
        <p className="text-center text-[13px] text-text-light">앞으로 30일, <span className="font-bold text-eye-purple">잘 맞는 날 {good}일</span> ✨</p>
      ) : null}
      <DayDetailCard cell={cell} />
      {data.entitled && reportLoading ? (
        <section className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">오늘 리포트를 펼치는 중…</section>
      ) : data.entitled && report ? (
        // DailyReportCard 는 자체 px-5 를 가진 full-bleed 블록 — main 의 p-4 와 겹쳐 이중 들여쓰기가
        // 나지 않게 -mx-4 로 가로 패딩을 상쇄한다(형제 카드들과 눈높이 맞춤).
        <div className="-mx-4"><DailyReportCard report={report} dateLabel="오늘" /></div>
      ) : (
        <PremiumBlock
          entitled={data.entitled}
          trialUsed={data.trialUsed}
          narrative={null}
          teaser={null}
          loading={false}
          onStartTrial={startTrial}
          onSubscribe={openSubscribe}
        />
      )}
      <section className="rounded-2xl bg-cream-warm p-4">
        <h2 className="mb-2 font-display text-base text-eye-purple">앞으로 30일 흐름</h2>
        <ul className="space-y-1 text-sm text-text-light">
          {data.weeks.map((w) => (
            <li key={w.index}>{fmtMD(w.startDate)}~{fmtMD(w.endDate)} — 잘 맞는 날 {w.good}일 · 챙길 날 {w.caution}일</li>
          ))}
        </ul>
      </section>
      {subscribeModal}
    </main>
  );
}
