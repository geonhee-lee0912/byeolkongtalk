"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import type { DailyReport } from "@/lib/fortune/daily-report";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
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
  monthStart: string;
  monthEnd: string;
  lockedDates: string[];
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


export default function SajuTodayView({ initialDate }: { initialDate?: string }) {
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
      // 허브 격자에서 넘어온 ?date= 가 있으면 그 날로 연다(스펙 §7 "요약은 허브, 전문은 밖").
      // 🔴 응답에 없는 날짜(무료 유저가 손으로 미래 날짜를 친 경우)면 무시하고 오늘로 — 서버가
      //    안 내려준 날을 선택 상태로 두면 cell 폴백이 타서 엉뚱한 날 상세가 열린다.
      const wanted = initialDate && data.cells.some((c) => c.date === initialDate) ? initialDate : data.today;
      setSelected((prev) => prev ?? wanted);

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
  // 폴백은 cells[0](= 이번 달 1일)이 아니라 **오늘**이다 — 달력이 이번 달로 바뀌며 1일이 되면
  // 첫 진입에서 엉뚱한 날짜의 상세가 열린다.
  const todayCell = data.cells.find((c) => c.isToday) ?? data.cells[data.cells.length - 1];
  const cell = data.cells.find((c) => c.date === selected) ?? todayCell;
  const selfGridCells: GridCell[] = data.cells.map((c) => ({
    date: c.date, ganji: c.ganji, tone: c.grade.tone, label: c.grade.label, isToday: c.isToday,
    marks: c.marks,
  }));
  const good = data.weeks.reduce((s, w) => s + w.good, 0);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <BackHeader title="오늘 사주" />
      <section aria-label="이번 달 캘린더">
        <CalendarGrid
          cells={selfGridCells}
          lockedDates={data.lockedDates}
          todayDate={data.today}
          selectedDate={cell.date}
          onSelect={setSelected}
          subjectKind="me"
        />
      </section>
      {/* 무료는 오늘까지만 집계돼 있으므로 "이번 달"이라고 하면 틀린 말이 된다 — 범위를 밝힌다.
          🔴 스펙 §15-1 완화: 챙길 날 수를 앞세우지 않는다(좋은 날 중심 서술). */}
      {good > 0 ? (
        <p className="text-center text-[13px] text-text-light">
          {data.entitled ? "이번 달" : "오늘까지"}, <span className="font-bold text-eye-purple">잘 맞는 날 {good}일</span> ✨
        </p>
      ) : null}
      <DayDetailCard cell={cell} />
      {/* 오늘 공유 — 선택 셀이 오늘일 때만(미래 날 보다 공유하면 "오늘 사주" 라벨로 다른 날이 나가는 오노출 방지). */}
      {cell.isToday ? (
        <button
          onClick={() => {
            const ok = shareToKakao({
              title: `오늘 사주 · ${DAY_NAME[cell.tenGod]}`,
              description: "오늘 네 하루 흐름, 별마루에서 무료로 매일 확인해봐.",
              imageUrl: `${window.location.origin}/api/og/byeolmaru/saju?grade=${cell.grade.tone}&ganji=${encodeURIComponent(cell.ganji)}&tg=${encodeURIComponent(cell.tenGod)}`,
              link: `${window.location.origin}/byeolmaru`,
              buttonTitle: "나도 보러가기",
            });
            trackUiEvent("byeolmaru_share_clicked", { meta: { kind: "saju", ok } });
          }}
          disabled={!isKakaoReady()}
          className="w-full rounded-xl border border-lilac-mid/40 bg-white py-2 text-xs font-medium text-lilac-deep disabled:opacity-40"
        >
          오늘 사주 공유하기
        </button>
      ) : null}
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
        <h2 className="mb-2 font-display text-base text-eye-purple">{data.entitled ? "이번 달 흐름" : "오늘까지의 흐름"}</h2>
        <ul className="space-y-1 text-sm text-text-light">
          {data.weeks.map((w) => (
            // 무료선(비자격)은 cells 가 "이번 달 1일~오늘"이라 길이가 7k+1 인 날(매달 1·8·15·22·29일)엔
            // 마지막 버킷이 하루짜리가 된다 — 그때만 시작일=종료일이라 날짜를 한 번만 찍는다.
            <li key={w.index}>{w.startDate === w.endDate ? fmtMD(w.startDate) : `${fmtMD(w.startDate)}~${fmtMD(w.endDate)}`} — 잘 맞는 날 {w.good}일 · 챙길 날 {w.caution}일</li>
          ))}
        </ul>
      </section>
      {subscribeModal}
    </main>
  );
}
