"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";
import { pickCrossSell } from "@/lib/byeolmaru/crosssell";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { PairDayCell } from "@/lib/byeolmaru/pair-day";
import { PAIR_TONE_LABEL } from "@/lib/byeolmaru/pair-day";
import AttendanceStrip from "./AttendanceStrip";
import CrossSellCard from "./CrossSellCard";
import PartnerChips, { type PartnerChip } from "./PartnerChips";
import WatchAddModal from "./WatchAddModal";
import TodayHeroTile from "./TodayHeroTile";
import FreeList, { buildFreeItems } from "./FreeList";
import CalendarGrid, { type GridCell } from "./CalendarGrid";
import PremiumBlock from "./PremiumBlock";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  lockedDates: string[];
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

// 비로그인·생일 미입력이 보는 "안 칠해진 이번 달"(스펙 §12). 판정이 없으므로 전부 잠긴 칸으로
// 그린다 — CalendarGrid 가 cells 없이 lockedDates 만 받으면 정확히 그 모양이 된다.
// 🔴 개인화 0 — 서버를 안 부르고 클라 날짜로만 만든다(비로그인은 세션이 없어 부를 것도 없다).
function emptyMonthDates(): { dates: string[]; today: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  return {
    dates: Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`),
    today: `${ym}-${String(kst.getUTCDate()).padStart(2, "0")}`,
  };
}

// 비로그인·생일 미입력 공통 껍데기(스펙 §12). 달력은 "안 칠해진 이번 달"이고, 목록은
// MBTI·별자리를 **위로** 올린다(로그인 없이 되므로 먼저 맛보게). 페이월은 숨긴다 —
// 아직 자기 달력을 받아본 적이 없는 사람에게 미끼는 광고로 읽힌다(스펙 §9).
function EmptyMonthShell({ cta }: { cta: React.ReactNode }) {
  const { dates, today } = emptyMonthDates();
  const items = buildFreeItems(null);
  // 로그인 없이 되는 둘을 앞으로, 로그인이 필요한 오늘 타로를 뒤로.
  const reordered = [...items.filter((i) => i.key !== "tarot"), ...items.filter((i) => i.key === "tarot")];
  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">무료로 다 보는 곳</p>
      </header>
      <section className="space-y-3">
        {/* lockedHint=false — 이 빈 달력은 "안 온 날"이 아니라 "생일이 없어 못 보는 날"이라
            CalendarGrid 기본 안내("그날이 오면 열려")를 끈다. 바로 아래 "네 생일만 있으면…" 문구가
            정확한 설명이다(P5-3 리뷰 — 두 문구가 모순되던 것을 정리). */}
        <CalendarGrid cells={[]} lockedDates={dates} todayDate={today} selectedDate={today} onSelect={() => {}} lockedHint={false} />
        <p className="text-center text-[13px] text-text-light">네 생일만 있으면 이 칸이 다 칠해져.</p>
        {cta}
      </section>
      <FreeList items={reordered} />
    </main>
  );
}

export default function ByeolmaruHub() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);

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

  // T6 — 달력 판 상단 인연 칩(스펙 §8). partners/subject 는 렌더는 T7 몫이지만 훅 규칙상
  // 조건부 early-return(아래 state.kind 분기) 이전에 선언해야 한다.
  const [partners, setPartners] = useState<PartnerChip[]>([]);
  const [subject, setSubject] = useState<string>("me");
  const [pairCells, setPairCells] = useState<PairDayCell[] | null>(null);
  const [pairLocked, setPairLocked] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  async function loadPartners() {
    try {
      const res = await fetch("/api/byeolmaru/watch", { cache: "no-store" });
      if (!res.ok) { setPartners([]); return; }
      const j = await res.json();
      setPartners(Array.isArray(j?.watched) ? j.watched : []);
    } catch { setPartners([]); }
  }
  useEffect(() => { void loadPartners(); }, []);

  // 상대 칩을 고르면 달력이 통째로 우리 버전이 된다(스펙 §8). 룰 100% 라 원가 0.
  // 🔴 cancelled 가드 — 칩을 빠르게 번갈아 누르면 낡은 응답이 최신 상태를 덮어쓴다
  //    (WooriTodayView 가 같은 이유로 같은 가드를 쓴다).
  // 🔴 !res.ok(예: 소유권 실패·서버 오류)일 때 아무 것도 안 하고 끝나면 칩은 파트너를 가리키는데
  //    달력 상태(pairCells)는 이전 그대로 남아 "칩≠데이터" 불일치가 생긴다(이전 상대 데이터가
  //    있었다면 그게 그대로 남아 새 칩 밑에 잘못 붙어 보인다). catch 블록과 동일하게 "나"로
  //    되돌리고 pairCells/pairLocked 도 함께 비워, 최소한 불일치 상태를 만들지 않는다.
  useEffect(() => {
    if (subject === "me") { setPairCells(null); setPairLocked([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/calendar?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !j) { setPairCells(null); setPairLocked([]); setSubject("me"); return; }
        setPairCells(Array.isArray(j.cells) ? j.cells : null);
        setPairLocked(Array.isArray(j.lockedDates) ? j.lockedDates : []);
      } catch {
        if (!cancelled) { setPairCells(null); setPairLocked([]); setSubject("me"); }
      }
    })();
    return () => { cancelled = true; };
  }, [subject]);

  const router = useRouter();

  // 오늘 뽑은 카드 — 목록 행 타일에만 쓴다(뽑기 자체는 /byeolmaru/tarot 가 한다).
  const [dailyCard, setDailyCard] = useState<{ cardId: number } | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/byeolmaru/daily-card", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (j?.card?.cardId != null) setDailyCard({ cardId: j.card.cardId });
      } catch { /* 목록 타일이 뒷면으로 남을 뿐이라 조용히 넘긴다 */ }
    })();
  }, []);

  if (state.kind === "loading") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">별마루를 펼치고 있어…</main>;
  if (state.kind === "need_login") return (
    <EmptyMonthShell
      cta={
        <Link
          href="/login?next=/byeolmaru"
          onClick={() => trackUiEvent("byeolmaru_guest_peek_clicked", { meta: { card: "login_cta", gated: true } })}
          className="block rounded-xl bg-lilac-deep px-4 py-3 text-center text-cream"
        >
          카카오로 시작하고 내 달력 받기
        </Link>
      }
    />
  );
  if (state.kind === "no_profile") return (
    <EmptyMonthShell
      cta={
        <Link
          href="/mypage"
          onClick={() => trackUiEvent("byeolmaru_guest_peek_clicked", { meta: { card: "profile_cta", gated: true } })}
          className="block rounded-xl bg-lilac-deep px-4 py-3 text-center text-cream"
        >
          생년월일 입력하러 가기
        </Link>
      }
    />
  );
  if (state.kind === "error") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">지금은 별마루를 못 펼쳤어. 잠시 뒤에 다시 와줄래?</main>;

  const { data } = state;
  // 폴백은 cells[0](이번 달 1일)이 아니라 마지막 칸이다 — 무료(비자격)는 오늘이 항상 마지막 칸이므로
  // "오늘 사주" 히어로가 폴백을 타도 1일이 아니라 오늘로 정렬된다(SajuTodayView 와 동일 근거).
  const todayCell = data.cells.find((c) => c.isToday) ?? data.cells[data.cells.length - 1];
  const crossSell = pickCrossSell(todayCell);
  const isPair = subject !== "me" && pairCells !== null;

  // 격자에 넘길 정규화 셀. 나·우리 두 판정 엔진이 같은 GridCell 계약으로 수렴한다.
  // 🔴 우리 셀엔 마크가 없다(우리 판정은 ✨끌림·🔗결속 태그를 쓴다) — 빈 배열을 **명시**한다.
  //    GridCell.marks 가 필수인 이유가 그것이다(옵셔널이면 조용히 사라진다).
  const gridCells: GridCell[] = isPair
    ? pairCells.map((c) => ({ date: c.date, ganji: c.ganji, tone: c.tone, label: PAIR_TONE_LABEL[c.tone], isToday: c.isToday, marks: [] }))
    : data.cells.map((c) => ({ date: c.date, ganji: c.ganji, tone: c.grade.tone, label: c.grade.label, isToday: c.isToday, marks: c.marks }));
  const gridLocked = isPair ? pairLocked : data.lockedDates;
  const filled = isPair ? pairCells.length : data.cells.length;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">무료로 다 보는 곳 · 오늘 {data.todayGanji}</p>
      </header>

      {/* ── 달력 판: 이 화면의 단 하나의 강조점(스펙 §3) ── */}
      <section className="space-y-3">
        <AttendanceStrip attendance={attendance} filledDays={filled} entitled={data.entitled} />

        {/* 오늘 히어로는 **나 탭에서만**. 우리 탭의 오늘은 톤·태그 성격이 달라 같은 타일에 안 들어간다
            — 우리 쪽 상세는 /byeolmaru/woori 가 받는다(스펙 §8). */}
        {!isPair && <TodayHeroTile cell={todayCell} href="/byeolmaru/saju" />}

        <PartnerChips
          partners={partners}
          selected={subject}
          onSelect={(id) => { if (id !== "me") trackUiEvent("byeolmaru_partner_selected"); setSubject(id); }}
          onAdd={() => setAddOpen(true)}
        />

        <CalendarGrid
          cells={gridCells}
          lockedDates={gridLocked}
          todayDate={data.today}
          selectedDate={data.today}
          onSelect={(date) => {
            // 🔴 허브 격자는 "고르는" 곳이 아니라 "여는" 곳이다(스펙 §7 요약은 안, 전문은 밖).
            //    나 탭은 그 날의 상세로, 우리 탭은 우리 상세로 보낸다.
            if (isPair) { router.push("/byeolmaru/woori"); return; }
            router.push(date === data.today ? "/byeolmaru/saju" : `/byeolmaru/saju?date=${date}`);
          }}
        />

        {/* 🔴 미끼 자리 — 내용·톤·CTA·계측은 P5-4 몫이다(스펙 §9). 지금은 자리만 잡는다.
            비로그인·생일 미입력에게는 애초에 이 분기까지 안 온다(위 상태 분기에서 갈린다). */}
        {!data.entitled && (
          <PremiumBlock
            entitled={false}
            trialUsed={data.trialUsed}
            narrative={null}
            teaser={null}
            loading={false}
            onStartTrial={startTrial}
            onSubscribe={openSubscribe}
          />
        )}
      </section>

      <FreeList items={buildFreeItems(dailyCard)} />

      <CrossSellCard item={crossSell} />
      {subscribeModal}
      {addOpen && (
        <WatchAddModal
          onClose={() => setAddOpen(false)}
          onAdded={(id) => { setAddOpen(false); void loadPartners(); setSubject(id); }}
        />
      )}
    </main>
  );
}
