"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DayCell, WeekBucket, LockedCell } from "@/lib/byeolmaru/calendar";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { PairDayCell } from "@/lib/byeolmaru/pair-day";
import { PAIR_TONE_LABEL, pairMarks } from "@/lib/byeolmaru/pair-day";
import HubBanner from "./HubBanner";
import AttendanceStrip from "./AttendanceStrip";
import DayStrip, { type StripCell } from "./DayStrip";
import MonthGridSection from "./MonthGridSection";
import PartnerChips, { type PartnerChip } from "./PartnerChips";
import WatchAddModal from "./WatchAddModal";
import FreeList, { buildFreeItems } from "./FreeList";
import CalendarGrid, { PANEL_BG, PANEL_BORDER, PANEL_SHADOW, type GridCell } from "./CalendarGrid";
import PremiumBlock from "./PremiumBlock";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  lockedCells: LockedCell[];
  weeks: WeekBucket[];
  strip: { cells: DayCell[]; lockedCells: LockedCell[] };
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
// 그린다 — CalendarGrid 가 cells 없이 lockedCells 만 받으면 정확히 그 모양이 된다.
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
  // 🔴 로그인·생일이 있어야 되는 것을 뒤로 보낸다. **부정 필터(`!== "tarot"`)로 쓰지 않는다** —
  //    목록에 항목이 하나 늘 때마다 조용히 "로그인 없이 됨" 쪽으로 쓸려 들어간다(실제로 오늘 사주가
  //    그렇게 됐다: 눌러도 같은 로그인 벽으로 되돌아오는 막다른 길이 됐었다).
  const NO_LOGIN_KEYS = ["mbti", "byeoljari"];
  const reordered = [
    ...items.filter((i) => NO_LOGIN_KEYS.includes(i.key)),
    ...items.filter((i) => !NO_LOGIN_KEYS.includes(i.key)),
  ];
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
        <CalendarGrid cells={[]} lockedCells={dates.map((d) => ({ date: d, ganji: "" }))} todayDate={today} selectedDate={today} onSelect={() => {}} lockedHint={false} />
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
  const [pairLocked, setPairLocked] = useState<LockedCell[]>([]);
  const [pairStrip, setPairStrip] = useState<{ cells: PairDayCell[]; lockedCells: LockedCell[] } | null>(null);
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

  // state 가 유니온이라 "ready" 로 좁혀지기 전에도 파생값으로 미리 꺼내둔다(WooriTodayView 의
  // entitledNow 와 동일 패턴, P5-3 리뷰 I-1) — 아래 pair effect 의 deps 에 쓰기 위해서다.
  const entitledNow = state.kind === "ready" && state.data.entitled;

  // 상대 칩을 고르면 달력이 통째로 우리 버전이 된다(스펙 §8). 룰 100% 라 원가 0.
  // 🔴 cancelled 가드 — 칩을 빠르게 번갈아 누르면 낡은 응답이 최신 상태를 덮어쓴다
  //    (WooriTodayView 가 같은 이유로 같은 가드를 쓴다).
  // 🔴 !res.ok(예: 소유권 실패·서버 오류)일 때 아무 것도 안 하고 끝나면 칩은 파트너를 가리키는데
  //    달력 상태(pairCells)는 이전 그대로 남아 "칩≠데이터" 불일치가 생긴다(이전 상대 데이터가
  //    있었다면 그게 그대로 남아 새 칩 밑에 잘못 붙어 보인다). catch 블록과 동일하게 "나"로
  //    되돌리고 pairCells/pairLocked 도 함께 비워, 최소한 불일치 상태를 만들지 않는다.
  // 🔴 (P5-3 리뷰 I-1) effect **시작**에서도 pairCells/pairLocked 를 리셋한다 — 예전엔 여기가
  //    없어서 A→B 전환 중 A 의 낡은 달력이 B 칩 아래 그대로 남았다(서버가 파트너 calcSaju+30일
  //    캘린더+자격+watch 조회를 하므로 이 창이 짧지 않다). 렌더 쪽 viewingPair/isPair 가 이
  //    리셋 직후의 "아직 도착 전" 상태를 로딩 문구로 보여준다.
  // 🔴 deps 에 entitledNow 를 추가한다 — 우리 모드를 보는 도중 체험/구독을 시작하면 self 응답
  //    (refresh())만 갱신되고 pairCells 는 그대로였다(20별을 쓰고도 우리 달력은 점선 그대로).
  //    entitledNow 가 false→true 로 바뀌면 이 effect 가 다시 돌아 같은 상대를 잠금 없이 재요청한다.
  useEffect(() => {
    if (subject === "me") { setPairCells(null); setPairLocked([]); setPairStrip(null); return; }
    let cancelled = false;
    setPairCells(null); setPairLocked([]); setPairStrip(null);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/calendar?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !j) { setPairCells(null); setPairLocked([]); setPairStrip(null); setSubject("me"); return; }
        setPairCells(Array.isArray(j.cells) ? j.cells : null);
        setPairLocked(Array.isArray(j.lockedCells) ? j.lockedCells : []);
        setPairStrip(j.strip ?? null);
      } catch {
        if (!cancelled) { setPairCells(null); setPairLocked([]); setPairStrip(null); setSubject("me"); }
      }
    })();
    return () => { cancelled = true; };
  }, [subject, entitledNow]);

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
  // viewingPair — 상대 칩을 골랐다는 "의도"(데이터 도착 여부와 무관). isPair — 실제로 그 상대의
  // 달력을 그릴 수 있는 상태(데이터 도착 완료). 격자·스트립은 데이터가 아직이면
  // (viewingPair && !isPair) 로딩 문구를 대신 보여준다 — pairCells 를 effect 시작에서 항상
  // 리셋하기 때문에 이 조합이 곧 "전환 중" 신호가 된다(P5-3 리뷰 I-1, 별도 pairLoading 상태 없이
  // 기존 두 값의 조합으로 충분해 상태를 늘리지 않았다).
  const viewingPair = subject !== "me";
  const isPair = viewingPair && pairCells !== null;

  // 격자에 넘길 정규화 셀. 나·우리 두 판정 엔진이 같은 GridCell 계약으로 수렴한다.
  // 🔴 우리 셀 마크는 나 탭과 같은 글리프 문법이다(P5-5 pairMarks) — 판정 primitive 가 같아서
  //    ✧천간합→끌림 · ◇육합→결속 · △충→삐걱 으로 라벨만 관계 어휘로 바뀐다.
  const gridCells: GridCell[] = isPair
    ? pairCells.map((c) => ({ date: c.date, ganji: c.ganji, tone: c.tone, label: PAIR_TONE_LABEL[c.tone], isToday: c.isToday, marks: pairMarks(c.tags) }))
    : data.cells.map((c) => ({ date: c.date, ganji: c.ganji, tone: c.grade.tone, label: c.grade.label, isToday: c.isToday, marks: c.marks }));
  const gridLocked = isPair ? pairLocked : data.lockedCells;
  const filled = isPair ? pairCells.length : data.cells.length;

  // 스트립 셀 — 나/우리 두 판정이 StripCell 로 수렴한다(격자의 GridCell 과 같은 패턴).
  // 제목은 나 탭이 "하루 이름"(DAY_NAME), 우리 탭이 톤 라벨이다 — 우리 탭엔 십신 개념이 없다.
  const stripCells: StripCell[] = isPair
    ? (pairStrip?.cells ?? []).map((c) => ({
        date: c.date, ganji: c.ganji, tone: c.tone, title: PAIR_TONE_LABEL[c.tone], marks: pairMarks(c.tags), isToday: c.isToday,
      }))
    : (data.strip?.cells ?? []).map((c) => ({
        date: c.date, ganji: c.ganji, tone: c.grade.tone, title: DAY_NAME[c.tenGod], marks: c.marks, isToday: c.isToday,
      }));
  // 🔴 `?.` 는 불가능한 시나리오 방어가 아니다 — 배포 롤아웃 창에서 **새 번들이 구 API 를 만날 수**
  //    있고(스큐), 그때 data.strip 이 없으면 프로퍼티 접근이 먼저 터져 허브 전체가 에러 바운더리로
  //    간다. 비면 DayStrip 이 스스로 null 을 돌려주므로 화면은 스트립만 빠진 채 멀쩡히 선다.
  const stripLocked = (isPair ? pairStrip?.lockedCells : data.strip?.lockedCells) ?? [];

  // 비자격자의 다음 걸음 — 체험을 안 썼으면 체험, 썼으면 구독. 스트립 잠긴 칸과 CTA 가 같이 쓴다.
  const nextStep = () => (data.trialUsed ? openSubscribe() : startTrial());

  // 날짜 탭의 목적지 — 격자와 스트립이 **같은 함수**를 쓴다(둘이 갈리면 같은 날이 두 곳으로 간다).
  // 🔴 허브의 날짜 칸은 "고르는" 곳이 아니라 "여는" 곳이다 — 요약은 안, 전문은 밖(스펙 §7).
  // 🔴 우리 탭의 `?subject=` 는 장식이 아니다. 없으면 도착지가 "위에서 상대를 골라…" 안내로
  //    되돌아가 통합 취지가 끊긴다(P5-3 리뷰 I-2 에서 실제로 겪은 회귀).
  function openDay(date: string) {
    if (isPair) { router.push(`/byeolmaru/woori?subject=${encodeURIComponent(subject)}`); return; }
    router.push(date === data.today ? "/byeolmaru/saju" : `/byeolmaru/saju?date=${date}`);
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <HubBanner />

      {/* 🔴 달력 판 — 칩·출석·스트립·격자는 **한 물건**이다(다 "이 사람의 이 달"을 말한다).
          예전엔 넷이 각자 다른 표면(배경 없음 / 흰 칸 / 크림 버튼 / 연보라 박스)으로 `space-y-4`
          위에 흩어져 있어 무엇이 무엇에 속하는지가 안 보였다 — 사용자 지적. 크림 카드 하나로 묶고
          층은 얇은 선으로만 나눈다. 판 밖에 남는 것(배너·PremiumBlock·무료 목록)은 달력에 속하지 않는다.
          🔴 표면을 순크림(cream-warm)으로 먼저 만들어봤다가 되돌렸다 — 칸의 "무난한 날"이 순백이라
             **크림 판 위에서 칸 경계가 사라졌다**(실측). 격자가 원래 쓰던 크림→연보라 그라데이션을
             판 전체로 올리면 흰 칸이 다시 떠오른다. 그래서 PANEL_* 를 CalendarGrid 에서 가져다 쓴다. */}
      <section className="rounded-2xl p-4" style={{ background: PANEL_BG, border: PANEL_BORDER, boxShadow: PANEL_SHADOW }}>
        {/* 섹션 타이틀 — FreeList 와 같은 문법(골드 3px 바 + 제목)이다. 두 판이 같은 옷을 입어야
            "허브는 판 몇 개로 이루어져 있다"가 보인다. 문구는 대상 중립으로 둔다 — 누구의 달력인지는
            바로 아래 칩이 이미 말하므로 제목까지 "내/우리"를 쓰면 칩과 겹친다. */}
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden className="h-[3px] w-4 rounded-full bg-gold" />
          <h2 className="font-display text-base text-eye-purple">날마다 흐름</h2>
        </div>

        <PartnerChips
          partners={partners}
          selected={subject}
          onSelect={(id) => { if (id !== "me") trackUiEvent("byeolmaru_partner_selected"); setSubject(id); }}
          onAdd={() => setAddOpen(true)}
        />

        {viewingPair && !isPair ? (
          // 전환 중(리셋 직후~응답 도착 전) — 격자·스트립 자리에 로딩 문구를 둔다. 흐리는 대안은
          // 기각: 직전 상대의 실제 데이터를 블러 처리로 남기면 그 내용 자체가 여전히 비쳐 보여
          // "A의 달력이 B 칩 아래 남는다"는 원 증상을 형태만 바꿔 재현한다. 빈 그리드를 만들어
          // 흐리는 방법도 있지만 이 화면에 없던 스켈레톤 컴포넌트를 새로 만들어야 해 과한 수단이다.
          <p className="mt-3 border-t border-lilac-mid/20 py-8 text-center text-sm text-text-light">우리 달력을 펼치는 중…</p>
        ) : (
          <>
            <div className="mt-3 space-y-2 border-t border-lilac-mid/20 pt-3">
              <AttendanceStrip attendance={attendance} />
              <DayStrip
                cells={stripCells}
                lockedCells={stripLocked}
                todayDate={data.today}
                subjectKind={isPair ? "pair" : "me"}
                onSelect={openDay}
                onLockedSelect={nextStep}
              />
              {!data.entitled && (
                <p className="px-1 text-center text-[12px] text-text-light">
                  앞으로 3일도 미리 볼래?{" "}
                  {/* 🔴 패딩 없는 4글자 밑줄은 탭 타깃이 24px(WCAG 2.5.8)에 한참 못 미친다.
                      aria-label 로 제안 전체를 실어, 컨트롤 단위로 훑는 사용자에게도 맥락이 붙게 한다. */}
                  <button
                    type="button"
                    onClick={nextStep}
                    aria-label={`앞으로 3일도 미리 보기 — ${data.trialUsed ? "구독하기" : "3일 무료 체험"}`}
                    className="-my-1 inline-block px-2 py-1.5 font-bold text-lilac-deep underline"
                  >
                    {data.trialUsed ? "구독하기" : "3일 무료"}
                  </button>
                </p>
              )}
            </div>

            <div className="mt-2 border-t border-lilac-mid/20">
              {/* 🔴 panel={false} — 이 판이 이미 격자의 배경 역할을 한다. 켜두면 크림 카드 안에
                  연보라 박스가 또 생겨 3중 중첩이 된다(우리 탭·게스트 그리드는 감싸는 판이 없어 true). */}
              <MonthGridSection filledDays={filled}>
                <CalendarGrid
                  cells={gridCells}
                  lockedCells={gridLocked}
                  todayDate={data.today}
                  selectedDate={data.today}
                  subjectKind={isPair ? "pair" : "me"}
                  onSelect={openDay}
                  panel={false}
                />
              </MonthGridSection>
            </div>
          </>
        )}
      </section>

      {/* 🔴 미끼는 자리마다 다른 물건이다(스펙 §9). 나 탭은 오늘 사주 리포트를, 인연 탭은 우리 오늘을
          판다 — **같은 블록을 두 자리에 쓰면 광고로 읽힌다**. 비로그인·생일 미입력에게는 애초에 이
          분기까지 안 온다(위 상태 분기에서 갈린다). 스펙 §2 의 제거 목록에 없으므로 유지하고
          자리만 격자 뒤로 옮겼다. */}
      {!data.entitled && (
        <PremiumBlock
          entitled={false}
          trialUsed={data.trialUsed}
          narrative={null}
          teaser={null}
          loading={false}
          onStartTrial={startTrial}
          onSubscribe={openSubscribe}
          // 🔴 isPair(데이터 도착)가 아니라 viewingPair(의도) 기준이다 — 전환 중(상대 달력 도착 전)
          //    격자·스트립은 이미 "우리"인데 미끼만 "나" 얘기를 하면 어긋난다.
          slot={viewingPair ? "woori_30d" : "saju_report"}
          baitCtx={
            viewingPair
              ? { partnerName: partners.find((p) => p.id === subject)?.name }
              : { gradeLabel: todayCell.grade.label }
          }
        />
      )}

      <FreeList items={buildFreeItems(dailyCard)} />

      {subscribeModal}
      {addOpen && (
        <WatchAddModal
          onClose={() => setAddOpen(false)}
          // 🔴 loadPartners 를 await 한 뒤 setSubject 한다(P5-3 리뷰 I-4) — void 로 흘려보내면
          //    partners=[] · subject=새 id 가 동시에 참인 렌더가 생긴다. PartnerChips 는 0명일 때
          //    "＋ 인연 걸어두기" 버튼 하나만 그려 "나"로 돌아갈 길이 없다(보통 수백 ms 지만,
          //    /api/byeolmaru/watch GET 이 실패하면 setPartners([]) 로 확정돼 새로고침 전까지 못 나온다).
          onAdded={async (id) => { setAddOpen(false); await loadPartners(); setSubject(id); }}
        />
      )}
    </main>
  );
}
