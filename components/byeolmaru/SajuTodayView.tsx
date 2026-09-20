"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket, LockedCell } from "@/lib/byeolmaru/calendar";
import type { DailyReport } from "@/lib/fortune/daily-report";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
import { dayWordFor, reportDatePolicy, FUTURE_REPORT_DAYS } from "@/lib/byeolmaru/report-date";
import DailyReportCard from "@/components/fortune/DailyReportCard";
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
  lockedCells: LockedCell[];
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
  // 지난 날인데 그때 받은 리포트가 없는 경우 — 생성 실패와 구분해야 안내 문구가 맞는다.
  const [notGenerated, setNotGenerated] = useState(false);
  // 오늘+3일을 넘는 미래 — 생성 실패가 아니라 "아직 멀다". 재시도 문구가 뜨면 안 된다.
  const [outOfRange, setOutOfRange] = useState(false);

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

      setReport(null); setReportLoading(false);
    } catch { setState({ kind: "error" }); return; }
  }

  useEffect(() => { void refresh(); }, []);

  // 리포트는 선택 날짜 기준으로 따로 받아온다 — refresh() 안에 두면 날짜를 바꿔도 오늘 것만 계속 붙는다.
  // 🔴 비자격자는 아예 호출하지 않는다(403 방지 = 원가 0).
  const entitled = state.kind === "ready" && state.data.entitled;
  const todayKst = state.kind === "ready" ? state.data.today : null;
  useEffect(() => {
    if (!entitled || !selected || !todayKst) { setReport(null); setReportLoading(false); setNotGenerated(false); setOutOfRange(false); return; }
    // 🔴 범위 밖 미래는 서버에 묻지 않는다 — 구독자는 lockedCells 가 없어 이번 달 모든 날짜를
    //    클릭할 수 있는데, 오늘+3일을 넘으면 라우트가 400 date_out_of_range 를 준다(report·reason
    //    둘 다 없음). 그걸 report:null 로 흡수하면 PremiumBlock 의 "숨 고르는 중"(재시도 문구)으로
    //    떨어져 — 그 날짜가 가까워지기 전엔 영원히 안 될 일을 재시도하라고 말하게 된다.
    if (reportDatePolicy(selected, todayKst) === "out_of_range") {
      setReport(null); setNotGenerated(false); setOutOfRange(true); setReportLoading(false);
      return;
    }
    let cancelled = false;
    setReport(null);
    setNotGenerated(false);
    setOutOfRange(false);
    setReportLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/daily-report?date=${selected}`, { cache: "no-store" });
        const j = await res.json();
        if (!cancelled) {
          setReport(j.report ?? null);
          setNotGenerated(j.reason === "not_generated");
        }
      } catch {
        if (!cancelled) { setReport(null); setNotGenerated(false); setOutOfRange(false); }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entitled, selected, todayKst]);

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
  const good = data.weeks.reduce((s, w) => s + w.good, 0);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <BackHeader title="오늘 사주" />
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
              // 🔴 착지는 **허브**다(`/byeolmaru`). 공유 링크를 받는 사람은 대부분 비사용자인데,
              //    `/byeolmaru/saju` 는 비로그인에게 로그인 벽 한 줄뿐이라 utm 으로 재려는 바로 그
              //    전환을 깎는다. 허브는 게스트 미리보기(EmptyMonthShell)가 있어 받아낼 화면이 있다.
              link: `${window.location.origin}/byeolmaru?utm_source=byeolmaru_saju&utm_medium=share`,
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
        <section className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">{dayWordFor(cell.date, data.today)} 리포트를 펼치는 중…</section>
      ) : data.entitled && report ? (
        // DailyReportCard 는 자체 px-5 를 가진 full-bleed 블록 — main 의 p-4 와 겹쳐 이중 들여쓰기가
        // 나지 않게 -mx-4 로 가로 패딩을 상쇄한다(형제 카드들과 눈높이 맞춤).
        <div className="-mx-4">
          <DailyReportCard
            report={report}
            dateLabel={cell.isToday ? "오늘" : fmtMD(cell.date)}
            dayWord={dayWordFor(cell.date, data.today)}
          />
        </div>
      ) : data.entitled && notGenerated ? (
        <section className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">
          그날은 리포트를 안 받았어. 지난 날은 그때 받은 것만 보여줄 수 있어.
        </section>
      ) : data.entitled && outOfRange ? (
        <section className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">
          그날은 아직 멀어. 앞으로 {FUTURE_REPORT_DAYS}일까지만 미리 볼 수 있어.
        </section>
      ) : (
        <PremiumBlock
          entitled={data.entitled}
          trialUsed={data.trialUsed}
          narrative={null}
          teaser={null}
          loading={false}
          onStartTrial={startTrial}
          onSubscribe={openSubscribe}
          slot="saju_report"
          // 🔴 라벨은 "오늘이 선택됐을 때만" 싣는다. 이 자리에서 파는 건 daily-report 인데 그
          //    라우트엔 날짜 파라미터가 없어 항상 오늘만 만든다(자격자 분기도 dateLabel="오늘").
          //    ① cell.grade.label 을 싣으면 과거 날을 고른 사람에게 "그 날을 풀어주겠다"는 못 지킬
          //       약속이 되고, ② todayCell 을 늘 싣으면 위 DayDetailCard 에 없는 라벨을 인용한다.
          //    → 오늘일 때만 인용하고, 아니면 라벨 없이 오늘 얘기로 떨어뜨린다(baitLead 폴백).
          baitCtx={{ gradeLabel: cell.isToday ? cell.grade.label : undefined }}
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
