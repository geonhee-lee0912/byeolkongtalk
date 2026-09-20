"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket, LockedCell } from "@/lib/byeolmaru/calendar";
import type { DailyReport } from "@/lib/fortune/daily-report";
// 🔴 타입만 가져온다(`import type`) — 이 모듈 본체는 getServiceSupabase 를 끌고 들어오는 서버 래퍼다.
//    값으로 import 하면 클라이언트 번들에 service_role 경로가 딸려 들어간다(DayDetailCard 와 같은 이유).
import type { DailyCard } from "@/lib/byeolmaru/daily-card";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
import { dayWordFor, reportDatePolicy, FUTURE_REPORT_DAYS } from "@/lib/byeolmaru/report-date";
import { getSajuTaste } from "@/lib/byeolmaru/static-lines";
import { SAJU_PAID_CHARS, SAJU_PAID_SECTIONS } from "@/lib/byeolmaru/paywall-sections";
import DailyReportCard from "@/components/fortune/DailyReportCard";
import DayDetailCard from "./DayDetailCard";
import PaywallCut from "./PaywallCut";
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
    //    둘 다 없음). 그걸 report:null 로 흡수하면 자격자 분기의 마지막 폴백("숨 고르는 중" = 재시도
    //    문구)으로 떨어져 — 그 날짜가 가까워지기 전엔 영원히 안 될 일을 재시도하라고 말하게 된다.
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

  // 그날 뽑은 카드(§4) — 자격과 무관한 무료 정보다(리포트 effect 와 달리 entitled 를 안 본다).
  // 🔴 **3상태**다: undefined = 아직 모름 / null = 없음(확정) / DailyCard = 있음.
  //    null 하나로 합치면 왕복(100ms~1s) 동안 실제로 뽑은 사람에게 "안 뽑았어"가 깜빡이고,
  //    그 사이 "뽑으러 가기" CTA 까지 눌린다. 모르는 동안은 카드 블록 자체를 안 그린다(아래 게이트).
  const [dayCard, setDayCard] = useState<DailyCard | null | undefined>(undefined);
  useEffect(() => {
    if (!selected) { setDayCard(undefined); return; }
    let cancelled = false;
    setDayCard(undefined);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/daily-card?date=${selected}`, { cache: "no-store" });
        // 미래 날짜엔 행이 없어 자연히 null 이 온다 — 라우트가 미래를 막지 않는 이유도 그것.
        const j = res.ok ? await res.json() : null;
        if (!cancelled) setDayCard(j?.card ?? null);
      } catch {
        // 🔴 실패해도 undefined(모름)로 남겨두지 않는다 — 그러면 카드 블록이 영영 안 뜬다.
        //    "없음"으로 확정하는 게 맞다(카드 자리만 비는 blip, 화면 전체를 실패로 만들지 않는다).
        if (!cancelled) setDayCard(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

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
  const dayWord = dayWordFor(cell.date, data.today);
  const policy = reportDatePolicy(cell.date, data.today);
  // 절단선 칩의 숫자는 실제로 그린 글자 수다 — DayDetailCard 가 쓰는 것과 같은 뱅크(같은 인자 → 같은 문장).
  const taste = getSajuTaste(cell.grade.tone, cell.axes, cell.relation, cell.date);
  const tasteText = [taste.overall, taste.love, taste.work, taste.money, taste.advice].filter(Boolean).join(" ");
  // 카드가 없을 때 그 자리에 쓸 말 — 과거는 "그날은 안 뽑았어", 오늘은 뽑기 유도, 미래는 "그날 뽑는 거야".
  // 🔴 맨 앞이 "아직 모름(undefined)" 게이트다 — hint·href 를 둘 다 null 로 떨어뜨리면 DayDetailCard 가
  //    카드 블록 자체를 숨긴다. 블록이 없다가 생기는 레이아웃 점프는 받아들인다(이 화면은 리포트도
  //    비동기라 위에서 아래로 채워지는 게 기본 리듬이다). 스켈레톤은 안 쓴다 — 한 줄짜리 요약이라
  //    골격을 그릴 덩치가 아니다(스펙 §4 의 스켈레톤은 리포트 자리 몫).
  const cardHint = dayCard === undefined
    ? null
    : dayCard
      ? null
      : cell.isToday
        ? "아직 안 뽑았어."
        : policy === "cache_only"
          ? "그날은 카드를 안 뽑았어."
          : "카드는 그날 뽑는 거야.";
  // 링크는 카드를 뽑을 수 있는 날에만 — 지난 날 상세에서 오늘 뽑기 화면으로 보내면 날짜가 어긋난다.
  const cardHref = dayCard === undefined ? null : dayCard || cell.isToday ? `/byeolmaru/tarot?date=${cell.date}` : null;

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
      {/* 한 장(§5-1) — 무료 구간(일진 히어로·taste·축·그날 카드)은 DayDetailCard 가 그리고,
          그 아래 children 으로 유료 리포트 **또는** 절단선이 붙는다.
          🔴 PaywallCut 은 마운트만으로 gate_shown 을 찍는다 — 반드시 **비자격 분기에서만** 넘긴다
             (자격자에게 넘기면 그 계측의 분모가 구독자로 오염된다). */}
      {/* card 는 `?? null` — DayDetailCard 의 계약은 `DailyCard | null` 이라 "아직 모름"은
          여기서 "없음"으로 눌러 넘긴다(그 상태는 위 cardHint·cardHref 게이트가 이미 책임진다). */}
      <DayDetailCard cell={cell} dayWord={dayWord} card={dayCard ?? null} cardHref={cardHref} cardHint={cardHint}>
        {data.entitled ? (
          reportLoading ? (
            <div className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
              {dayWord} 리포트를 펼치는 중…
            </div>
          ) : report ? (
            <div className="mt-4 border-t border-lilac-mid/20 pt-4">
              {/* dateLabel={null} — 날짜는 한 장의 헤더가 이미 말했다. embedded 는 상단 바 자체를
                  안 그려 넘겨도 안 보이지만, 계약을 분명히 하려고 null 을 준다. */}
              <DailyReportCard report={report} dateLabel={null} dayWord={dayWord} variant="embedded" />
            </div>
          ) : notGenerated ? (
            <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
              그날은 리포트를 안 받았어. 지난 날은 그때 받은 것만 보여줄 수 있어.
            </p>
          ) : outOfRange ? (
            <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
              그날은 아직 멀어. 앞으로 {FUTURE_REPORT_DAYS}일까지만 미리 볼 수 있어.
            </p>
          ) : (
            <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
              별콩이가 잠깐 숨 고르는 중이야. 조금 뒤에 다시 와줄래?
            </p>
          )
        ) : (
          /* 🔴 여기만 border-t 래퍼가 없다(의도) — PaywallCut 이 자체 금색 절단선을 갖고 있어
                감싸면 선이 두 개가 된다. 위 분기들과 "통일"하지 말 것. */
          <PaywallCut
            freeChars={tasteText.length}
            paidChars={SAJU_PAID_CHARS}
            sections={SAJU_PAID_SECTIONS}
            blurText={tasteText}
            trialUsed={data.trialUsed}
            onStartTrial={startTrial}
            onSubscribe={openSubscribe}
            slot="saju_report"
          />
        )}
      </DayDetailCard>
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
