"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DayCell, WeekBucket, LockedCell } from "@/lib/byeolmaru/calendar";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";
import { DAY_NAME } from "@/lib/byeolmaru/day-label";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import HubBanner from "./HubBanner";
import TodayLead from "./TodayLead";
import DayStrip, { type StripCell } from "./DayStrip";
import MonthGridSection from "./MonthGridSection";
import FreeList, { buildDailyItems, buildSelfItems } from "./FreeList";
import SectionMark from "@/components/common/SectionMark";
import CalendarGrid, { PANEL_BG, PANEL_BORDER, PANEL_SHADOW, type GridCell } from "./CalendarGrid";
import { scoreDisplay } from "@/lib/byeolmaru/calendar-visual";
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
  /** 체험 자격자는 subscriptionExpiresAt 이 null 이라 배너 D-N 이 이 필드를 본다. */
  trialEndsAt: string | null;
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
// "나를 알아보는 것"(MBTI·별자리)을 **위로** 올린다 — 로그인 없이 되는 유일한 2종이라 먼저
// 맛보게 한다. 페이월은 숨긴다 — 아직 자기 달력을 받아본 적이 없는 사람에게 미끼는 광고로
// 읽힌다(스펙 §9).
// 🔴 예전의 키 기반 reorder(`NO_LOGIN_KEYS`)를 지웠다. 이제 두 섹션이 각자 함수라
//    **순서만 바꾸면 되고**, 새 항목이 조용히 잘못된 쪽으로 쓸려 들어갈 길이 없다.
function EmptyMonthShell({ cta }: { cta: React.ReactNode }) {
  const { dates, today } = emptyMonthDates();
  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4 pb-8">
      {/* 🔴 게스트도 배너를 본다(2026-09-24). 예전엔 여기만 옛 `<header>`(h1 + 부제)였는데, 그건
          결정이 아니라 **누락**이었다 — EmptyMonthShell 은 P5-3(35985ab), HubBanner 는 그 뒤
          P6-3(a11f6fa) 이라 배너가 로그인 허브에만 붙고 이쪽은 안 따라왔다.
          🔴 `cta={false}` — 비로그인에게 체험 버튼을 띄우면 누르는 순간 startTrial 이 401 이고,
             이 화면엔 이미 더 큰 CTA(아래 {cta})가 있다. */}
      <HubBanner cta={false} entitled={false} trialUsed={false} />
      <section className="space-y-3">
        {/* lockedHint=false — 이 빈 달력은 "안 온 날"이 아니라 "생일이 없어 못 보는 날"이라
            CalendarGrid 기본 안내("그날이 오면 열려")를 끈다. 바로 아래 "네 생일만 있으면…" 문구가
            정확한 설명이다(P5-3 리뷰 — 두 문구가 모순되던 것을 정리). */}
        <CalendarGrid cells={[]} lockedCells={dates.map((d) => ({ date: d, ganji: "" }))} todayDate={today} selectedDate={today} onSelect={() => {}} lockedHint={false} />
        <p className="text-center text-[13px] text-text-light">네 생일만 있으면 이 칸이 다 칠해져.</p>
        {cta}
      </section>
      <FreeList items={buildSelfItems()} title="나를 알아보는 것" mark="self" />
      <FreeList items={buildDailyItems(null)} title="오늘 볼 것" mark="today" />
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

  // 🔴 허브 달력은 **1인칭 전용**이다(2026-09-21 결정). 예전엔 판 상단 인연 칩으로 같은 판이
  //    나/우리를 번갈아 가리켰는데, 그러면 판을 감싼 모든 문구가 한쪽 주체에만 참이 됐다 —
  //    출석 연속("3일 연속 들르는 중")은 내 방문 기록인데 상대 달력 위에 그대로 남았고,
  //    "N칸 열림"과 섹션 제목도 같은 말로 다른 걸 가리켰다. 우리 오늘은 무료 목록 행
  //    (FreeList `woori`) → `/byeolmaru/woori` 로 내려가, 오늘 사주·오늘 타로와 같은 문법이 됐다.
  const gridCells: GridCell[] = data.cells.map((c) => ({
    date: c.date, score: c.score, tone: c.grade.tone, label: c.grade.label, isToday: c.isToday, marks: c.marks,
  }));
  const stripCells: StripCell[] = (data.strip?.cells ?? []).map((c) => ({
    date: c.date, score: c.score, tone: c.grade.tone, title: DAY_NAME[c.tenGod], label: c.grade.label, marks: c.marks, isToday: c.isToday,
  }));
  // 🔴 `?.` 는 불가능한 시나리오 방어가 아니다 — 배포 롤아웃 창에서 **새 번들이 구 API 를 만날 수**
  //    있고(스큐), 그때 data.strip 이 없으면 프로퍼티 접근이 먼저 터져 허브 전체가 에러 바운더리로
  //    간다. 비면 DayStrip 이 스스로 null 을 돌려주므로 화면은 스트립만 빠진 채 멀쩡히 선다.
  const stripLocked = data.strip?.lockedCells ?? [];
  const todayCell = stripCells.find((c) => c.isToday) ?? null;

  // 비자격자의 다음 걸음 — 체험을 안 썼으면 체험, 썼으면 구독. 스트립 잠긴 칸과 CTA 가 같이 쓴다.
  const nextStep = () => (data.trialUsed ? openSubscribe() : startTrial());

  // 날짜 탭의 목적지 — 격자와 스트립이 **같은 함수**를 쓴다(둘이 갈리면 같은 날이 두 곳으로 간다).
  // 🔴 허브의 날짜 칸은 "고르는" 곳이 아니라 "여는" 곳이다 — 요약은 안, 전문은 밖(스펙 §7).
  function openDay(date: string) {
    router.push(date === data.today ? "/byeolmaru/saju" : `/byeolmaru/saju?date=${date}`);
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4 pb-8">
      {/* 🔴 배너가 허브의 **유일한** 구독 면이다(2026-09-24). 예전엔 ①DayStrip 아래 인라인 문구
          ②달력 밑 PremiumBlock 둘이 더 있었는데, 375×812 실측에서 셋 다 첫 화면에 들어왔다.
          판매는 "더 보고 싶다"가 생기는 자리 — 오늘 사주·오늘 타로의 PaywallCut(절단선) — 가
          맡고, 허브는 습관 쪽만 진다(사용자 결정). **여기에 미끼 카드를 되살리지 말 것.** */}
      <HubBanner
        entitled={data.entitled}
        trialUsed={data.trialUsed}
        subscriptionExpiresAt={data.subscriptionExpiresAt}
        trialEndsAt={data.trialEndsAt}
        onSubscribe={nextStep}
      />

      {/* 🔴 달력 판 — 칩·출석·스트립·격자는 **한 물건**이다(다 "이 사람의 이 달"을 말한다).
          예전엔 넷이 각자 다른 표면(배경 없음 / 흰 칸 / 크림 버튼 / 연보라 박스)으로 `space-y-4`
          위에 흩어져 있어 무엇이 무엇에 속하는지가 안 보였다 — 사용자 지적. 크림 카드 하나로 묶고
          층은 얇은 선으로만 나눈다. 판 밖에 남는 것(배너·무료 목록)은 달력에 속하지 않는다.
          🔴 표면을 순크림(cream-warm)으로 먼저 만들어봤다가 되돌렸다 — 칸의 "무난한 날"이 순백이라
             **크림 판 위에서 칸 경계가 사라졌다**(실측). 격자가 원래 쓰던 크림→연보라 그라데이션을
             판 전체로 올리면 흰 칸이 다시 떠오른다. 그래서 PANEL_* 를 CalendarGrid 에서 가져다 쓴다. */}
      {/* 🔴 타이틀 + 판을 한 wrapper 로 묶는다 — main 의 space-y-4 는 형제 사이에 16px 을 넣는데,
          타이틀과 그 판은 **한 섹션**이라 그만큼 떨어지면 안 붙는다. wrapper 안에서만 8px 로 좁힌다.
          🔴 `pt-2` 는 배너와의 간격을 2탭(/fortune)에 맞추는 값이다 — 거기 타이틀이 `pt-6`(24px)이고
             여기는 space-y-4(16px)라 8px 모자랐다(실측). **margin 이 아니라 padding 을 쓴다** —
             `space-y-4` 가 만드는 `> * + *` 규칙이 `mt-*` 유틸리티보다 특정도가 높아 margin 은 진다. */}
      <div className="space-y-2 pt-2">
        {/* 섹션 타이틀 — 판 **밖**에 둔다. 아래 FreeList 두 섹션과 같은 문법(SectionMark 글리프 +
            본문체 15px bold 제목)이고, 그쪽도 타이틀이 카드 밖에 있어 세 섹션이 같은 리듬으로
            읽힌다. 인연 칩이 빠진 뒤로 이 판은 1인칭 전용이라 제목·출석·"N칸 열림"이 전부 같은
            주체를 가리킨다. */}
        <div className="flex items-center gap-2">
          <SectionMark kind="calendar" />
          <h2 className="text-[15px] font-bold text-eye-purple">내 하루 달력</h2>
        </div>

        {/* 🔴 p-3 은 칸 폭 계산의 일부다 — main p-4(32) → 343 / 판 p-3(24) → 319 /
            gap 2px × 6 = 12 → (319 − 12) / 7 = 43.9px. p-4 로 되돌리면 스트립 칸이 35px,
            격자 칸이 41px 로 돌아간다. */}
        <section className="rounded-2xl p-3" style={{ background: PANEL_BG, border: PANEL_BORDER, boxShadow: PANEL_SHADOW }}>
          {/* 🔴 위쪽 border-t 가 없다 — 인연 칩이 있던 시절엔 칩과 이 층을 가르는 선이었다.
              칩이 빠진 지금 그대로 두면 판 안쪽 맨 위에 선 하나가 떠 있게 된다. 판 안 구분선은
              아래 "이번 달" 층 하나만 남긴다. */}
          <div className="space-y-2">
            <TodayLead
              todayName={todayCell?.title ?? null}
              todayScore={todayCell ? scoreDisplay(todayCell.score) : null}
              attendance={attendance}
            />
            <DayStrip
              cells={stripCells}
              lockedCells={stripLocked}
              todayDate={data.today}
              subjectKind="me"
              onSelect={openDay}
              onLockedSelect={nextStep}
            />
            {/* 🔴 여기 있던 인라인 CTA("앞으로 3일도 미리 볼래? 구독하기")는 배너로 승격했다
                (2026-09-24). 잠긴 칸을 눌렀을 때의 유도는 **사라지지 않았다** — 위
                `onLockedSelect={nextStep}` 이 그대로 같은 곳으로 보낸다. 즉 맥락 유도는
                칸 자체가 지고, 말로 하는 권유만 배너 한 곳으로 모았다. */}
          </div>

          <div className="mt-2 border-t border-lilac-mid/20">
            {/* 🔴 panel={false} — 이 판이 이미 격자의 배경 역할을 한다. 켜두면 크림 카드 안에
                연보라 박스가 또 생겨 3중 중첩이 된다(우리 페이지·게스트 그리드는 감싸는 판이 없어 true). */}
            <MonthGridSection goodDates={data.cells.filter((c) => c.grade.tone === "good").map((c) => c.date)}>
              <CalendarGrid
                cells={gridCells}
                lockedCells={data.lockedCells}
                todayDate={data.today}
                selectedDate={data.today}
                onSelect={openDay}
                panel={false}
              />
            </MonthGridSection>
          </div>
        </section>
      </div>

      {/* 🔴 여기 있던 PremiumBlock(미끼 카드, slot="saju_report")은 제거했다(2026-09-24, 사용자 결정).
          근거: 구독 버튼이 힘을 받는 자리는 **무료로 읽다가 "더 보고 싶다"가 생기는 지점**이고,
          그건 오늘 사주·오늘 타로 화면 안의 PaywallCut(절단선)이다. 달력 밑은 그 감정이 생기기
          전이라 미리 파는 광고로 읽혔다.
          🔴 계측: `saju_report` slot 의 `surface="bait_card"` 가 이 자리에서 사라진다. PaywallCut 이
             설계한 비교("절단선이 미끼 카드보다 파는가")는 **별마루가 prod 에 한 번도 안 나가
             표본이 0이라** 끊을 추세선 자체가 없었다 — prod 배포 전인 지금이 제거 비용이 가장 싼
             시점이었다. 되살릴 땐 그 비교를 다시 세운다는 뜻임을 알고 할 것. */}

      {/* 🔴 위 달력 판과 간격을 더 준다(16 → 32px) — main 의 space-y-4 만으로는 달력 판과 이 목록이
          같은 층으로 읽혔다. 성격이 다른 섹션이라(날짜별 흐름 ↔ 무료 상품 목록) 숨을 한 번 쉰다.
          안쪽 space-y-6(24px)은 두 목록 섹션 **사이** 간격이다 — 16px(기본)이면 "오늘 볼 것" 마지막
          카드와 "나를 알아보는 것" 제목이 붙어 한 섹션으로 읽힌다. */}
      <div className="space-y-6 pt-4">
        <FreeList items={buildDailyItems(dailyCard)} title="오늘 볼 것" mark="today" />
        <FreeList items={buildSelfItems()} title="나를 알아보는 것" mark="self" />
      </div>

      {subscribeModal}
    </main>
  );
}
