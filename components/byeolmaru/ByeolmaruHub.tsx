"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";
import { pickCrossSell } from "@/lib/byeolmaru/crosssell";
import { DAY_NAME, DAY_LINE } from "@/lib/byeolmaru/day-label";
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
  lockedDates: string[];
}

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; data: CalendarResponse };

const DOT: Record<string, string> = { good: "bg-gold", normal: "bg-lilac", caution: "bg-lilac-mid" };

// 비로그인 구경 모드 — 카드 그리드(뭐가 있는지 + 한 줄)만 보이고, 개인화 카드는 탭하면 로그인 게이트.
// 개인화 0(스펙 §7 Loop 1). 무료 툴(MBTI·별자리)은 로그인 없이 바로 진입.
// key = 계측 안정 축(라벨이 바뀌어도 집계 유지). wide = 그리드 히어로 행(2칸 차지) → 5카드 홀수 방지.
// 게이트 next 는 카드별 목적지로(로그인 후 한 번에 도착 — 우리오늘은 서브페이지라 탭 절약).
const GUEST_CARDS: { key: string; emoji: string; title: string; desc: string; href: string; gated: boolean; wide?: boolean }[] = [
  { key: "saju", emoji: "🗓", title: "오늘 사주", desc: "오늘 잘 맞는 날인지, 살짝 챙길 날인지", href: "/login?next=/byeolmaru/saju", gated: true, wide: true },
  { key: "tarot", emoji: "🃏", title: "오늘 타로", desc: "카드 한 장으로 오늘을 가볍게 짚어봐", href: "/login?next=/byeolmaru", gated: true },
  { key: "woori", emoji: "💞", title: "우리 오늘", desc: "그 사람과 나, 오늘 둘 사이 흐름", href: "/login?next=/byeolmaru/woori", gated: true },
  { key: "mbti", emoji: "🧭", title: "사주 MBTI", desc: "사주로 보는 내 유형", href: "/fortune/saju-mbti", gated: false },
  { key: "byeoljari", emoji: "✨", title: "별 인연 지도", desc: "내 인연들을 별자리로", href: "/fortune/byeoljari", gated: false },
];

function GuestPeek() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">무료로 다 보는 곳 · 오늘 네 하루를 별콩이가 짚어줄게</p>
      </header>
      <div className="grid grid-cols-2 gap-3">
        {GUEST_CARDS.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            onClick={() => trackUiEvent("byeolmaru_guest_peek_clicked", { meta: { card: c.key, gated: c.gated } })}
            className={`rounded-2xl bg-cream-warm p-4 ${c.wide ? "col-span-2" : ""}`}
          >
            <div className="font-display text-base text-eye-purple">{c.emoji} {c.title}</div>
            <div className="mt-1 text-xs text-text-light">{c.desc}</div>
            {c.gated && <div className="mt-2 text-[11px] text-lilac-deep">로그인하면 열려 →</div>}
          </Link>
        ))}
      </div>
      <Link href="/login?next=/byeolmaru" className="block rounded-xl bg-lilac-deep px-4 py-3 text-center text-cream">
        로그인하고 내 오늘 보기
      </Link>
    </main>
  );
}

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
  if (state.kind === "need_login") return <GuestPeek />;
  if (state.kind === "no_profile") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">생년월일을 알려주면 오늘을 그려줄게.</p>
      <Link href="/mypage" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">생년월일 입력하러 가기</Link>
    </main>
  );
  if (state.kind === "error") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">지금은 별마루를 못 펼쳤어. 잠시 뒤에 다시 와줄래?</main>;

  const { data } = state;
  const todayCell = data.cells.find((c) => c.isToday) ?? data.cells[0];
  // 🔴 P5-2 로 cells 가 "이번 달 1일~"이 되면서 slice(0,7) 은 "1일부터 7일"을 뜻하게 됐다.
  //    자격자는 오늘부터 앞으로 7일(구독이 파는 게 '앞당겨 보기'라 앞을 보여준다),
  //    비자격자는 오늘이 마지막 칸이라 앞이 없으므로 **오늘로 끝나는 최근 7일**을 보여준다.
  const strip7 = data.entitled
    ? data.cells.filter((c) => c.date >= data.today).slice(0, 7)
    : data.cells.slice(-7);
  const crossSell = pickCrossSell(todayCell);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">오늘 들어온 두 글자 · {data.todayGanji}</p>
      </header>

      <AttendanceStrip attendance={attendance} loading={checkinLoading} onCheckin={handleCheckin} />

      <Link href="/byeolmaru/saju" className="block rounded-2xl bg-cream-warm p-4">
        <div className="mb-2">
          <span className="font-display text-base text-eye-purple">🗓 오늘 사주</span>
          {/* P5-1 — 이름(십신)이 제목이고 등급은 DayDetailCard 와 같은 구조로 형제 span 에 작게 둔다.
              🔴 등급을 이름 span 안에 중첩하면 font-display 가 상속돼 본문 폰트가 아니라 타이틀
                 폰트로 렌더된다(text-xs 는 크기만 덮고 font-family 는 못 덮는다).
              🔴 좌우 배치(justify-between)도 쓰지 않는다 — 375px 에서 이름×등급 조합 30개 중
                 12개가 줄바꿈되고, items-baseline 탓에 둘째 줄이 마주보는 것 없이 뜬다. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-display text-lg text-eye-purple">{DAY_NAME[todayCell.tenGod]}</span>
            <span className="text-xs text-text-light">· {todayCell.grade.label}</span>
          </div>
        </div>
        <div className="mb-2 flex gap-1.5">
          {strip7.map((c) => (
            <div key={c.date} className={`h-2.5 flex-1 rounded-full ${DOT[c.grade.tone] ?? "bg-lilac-soft"} ${c.isToday ? "ring-2 ring-lilac-deep" : ""}`} />
          ))}
        </div>
        {/* P5-1 — DAY_LINE 의 유일한 노출 지점. 상세 카드에선 getSajuTaste 의 overall 문장과
            결·문형이 겹쳐서 뺐다(뱅크마다 집은 하나씩). 여긴 taste 블록이 없어 겹치지 않는다. */}
        <p className="mb-1 text-xs leading-relaxed text-text-light">{DAY_LINE[todayCell.tenGod]}</p>
        <p className="text-xs text-lilac-deep">{data.entitled ? "앞으로 7일 흐름" : "지난 7일 흐름"} · 이번 달 전체 보기 →</p>
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
