"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import CalendarGrid from "./CalendarGrid";
import DayDetailCard from "./DayDetailCard";
import PartnerSlot from "./PartnerSlot";
import PremiumBlock from "./PremiumBlock";
import StarConfirmModal from "@/components/common/StarConfirmModal";

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

// "2026-09-04" → "9월 4일" (DayDetailCard 헤더와 동일 포맷).
function fmtMD(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

export default function ByeolmaruView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [premium, setPremium] = useState<{ narrative: string | null; teaser: string | null; loading: boolean }>({
    narrative: null,
    teaser: null,
    loading: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 구독 확인 팝업 잔액 — StarConfirmModal 은 balance===null 이면 확인 버튼이 영구
  // disabled 라(다른 8곳 소비자와 동일 계약) /api/stars/balance 로 실 잔액을 조회해 넘긴다.
  const [subBalance, setSubBalance] = useState<number | null>(null);
  const [subBalanceLoading, setSubBalanceLoading] = useState(false);

  // 🔴 단일 refresh(): 마운트 + 체험/구독 성공 후 둘 다 이 함수를 부른다. state.kind 는 trial
  // 시작 뒤에도 "ready" 그대로라 useEffect([state.kind]) 로는 서술 재요청이 안 걸린다 — 캘린더+
  // 서술을 매번 통째로 다시 받는 편이 안정적이다(entitled 재판정도 캘린더 응답에 실려 있어 같이
  // 새로고침된다).
  async function refresh() {
    try {
      const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
      // 401 은 "지금 못 펼쳤어"(error) 로 뭉뚱그리지 않는다 — 재시도로는 절대 안 풀리는
      // 로그인 문제라 전용 상태로 분리한다. 별마루가 하단 탭에 들어가면 비로그인 진입이
      // 흔한 경로가 된다(별도 code:"LOGIN_REQUIRED" 를 라우트가 이미 내려주고 있다).
      if (res.status === 401) {
        trackUiEvent("byeolmaru_need_login");
        setState({ kind: "need_login" });
        return;
      }
      if (res.status === 404) {
        trackUiEvent("byeolmaru_no_profile");
        setState({ kind: "no_profile" });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error" });
        return;
      }
      const data: CalendarResponse = await res.json();
      // tsconfig 의 noUncheckedIndexedAccess 가 꺼져 있어 data.cells[0] 은 배열이 비어도
      // 타입상 DayCell 로 보인다 — 런타임 undefined 를 못 잡고 DayDetailCard 가
      // cell.isToday 에서 크래시한다. 지금은 라우트가 빈 캘린더면 500 을 내서 못 만나지만
      // 그건 다른 파일의 계약이고 타입 시스템은 그 회귀를 못 잡아주니 여기서 직접 막는다.
      if (data.cells.length === 0) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ready", data });
      // 최초 로드만 오늘 날짜로 맞추고, 체험/구독 후 재조회에서는 유저가 보던 날짜를 유지한다.
      setSelected((prev) => prev ?? data.today);
    } catch {
      setState({ kind: "error" });
      return;
    }

    setPremium((p) => ({ ...p, loading: true }));
    try {
      const nRes = await fetch("/api/byeolmaru/narrative", { cache: "no-store" });
      const j = await nRes.json();
      setPremium({ narrative: j.narrative ?? null, teaser: j.teaser ?? null, loading: false });
    } catch {
      setPremium({ narrative: null, teaser: null, loading: false });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleStartTrial() {
    trackUiEvent("byeolmaru_trial_started");
    await fetch("/api/byeolmaru/trial", { method: "POST" });
    await refresh(); // entitled 이 true 로 바뀌고 narrative 가 채워진다
  }
  function handleSubscribeClick() {
    trackUiEvent("byeolmaru_subscribe_clicked");
    setConfirmOpen(true);
    // 잔액 조회 — app/tarot/draw, app/fortune/[type], ThreadDrawModal 과 동일한
    // /api/stars/balance 패턴(항상 200, 비로그인/에러는 0).
    setSubBalanceLoading(true);
    setSubBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance", { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        setSubBalance(typeof d?.balance === "number" ? d.balance : 0);
      } catch {
        setSubBalance(0);
      } finally {
        setSubBalanceLoading(false);
      }
    })();
  }
  async function handleSubscribeConfirm() {
    const res = await fetch("/api/byeolmaru/subscribe", { method: "POST" });
    if (res.status === 402) {
      window.location.href = "/shop";
      return;
    }
    if (res.ok) {
      trackUiEvent("byeolmaru_subscribe_completed");
      setConfirmOpen(false);
      await refresh();
      return;
    }
    // 500(purchase_failed) 등 — 모달을 닫아 무한 로딩처럼 보이지 않게 최소 신호를 준다.
    setConfirmOpen(false);
    alert("구독이 안 됐어. 잠시 후 다시 시도해줄래?");
  }

  if (state.kind === "loading") {
    return <main className="p-6 text-center text-text-light">별마루를 펼치고 있어…</main>;
  }
  if (state.kind === "need_login") {
    return (
      <main className="p-6 text-center">
        <p className="mb-4 text-eye-purple">로그인하면 네 달력을 펼쳐줄게.</p>
        <Link href="/login?next=/byeolmaru" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">
          로그인하러 가기
        </Link>
      </main>
    );
  }
  if (state.kind === "no_profile") {
    return (
      <main className="p-6 text-center">
        <p className="mb-4 text-eye-purple">생년월일을 알려주면 네 달력을 그려줄게.</p>
        {/* /fortune 은 진열대(카탈로그)일 뿐 생일 입력 폼이 없다 — 상품을 골라 들어가도
            내 사주(primary)가 없으면 그 화면조차 결국 /mypage 로 되돌린다
            (FortuneSajuPicker "아직 내 사주를 등록하지 않았어" 분기). /mypage 는 "내 사주"
            섹션에서 바로 "내 사주 입력하기" 버튼 → SelfSajuEditModal 로 한 번에 연결되는
            실제 등록 지점이라 여기서 곧장 이쪽으로 보낸다. */}
        <Link href="/mypage" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">
          생년월일 입력하러 가기
        </Link>
      </main>
    );
  }
  if (state.kind === "error") {
    return <main className="p-6 text-center text-text-light">지금은 별마루를 못 펼쳤어. 잠시 뒤에 다시 와줄래?</main>;
  }

  const { data } = state;
  const cell = data.cells.find((c) => c.date === selected) ?? data.cells[0];

  return (
    <main className="space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">
          오늘 들어온 두 글자 · {data.todayGanji}
        </p>
      </header>

      <section aria-label="30일 캘린더">
        <CalendarGrid cells={data.cells} selectedDate={cell.date} onSelect={setSelected} />
      </section>
      <DayDetailCard cell={cell} />

      <PremiumBlock
        entitled={data.entitled}
        trialUsed={data.trialUsed}
        narrative={premium.narrative}
        teaser={premium.teaser}
        loading={premium.loading}
        onStartTrial={handleStartTrial}
        onSubscribe={handleSubscribeClick}
      />
      {confirmOpen && (
        <StarConfirmModal
          cost={BYEOLMARU_SUBSCRIPTION.cost}
          balance={subBalance}
          loading={subBalanceLoading}
          accent="#E8C26A"
          title="별마루 구독"
          subtitle="30일 동안 매일 개인화를 열어둬"
          confirmLabel="구독하기"
          onConfirm={handleSubscribeConfirm}
          onCharge={() => (window.location.href = "/shop")}
          onClose={() => setConfirmOpen(false)}
        />
      )}

      <section className="rounded-2xl bg-cream-warm p-4">
        <h2 className="mb-2 font-display text-base text-eye-purple">앞으로 30일 흐름</h2>
        <ul className="space-y-1 text-sm text-text-light">
          {/* 30일 = 7×4+2 라 버킷은 항상 5개고 마지막은 2일짜리다("4주" 로 부르면 어긋난다 —
              lib/byeolmaru/calendar.ts weekBuckets 참고). 게다가 이 롤링 7일 버킷은 화면 위
              CalendarGrid 의 달력 요일 정렬과 경계가 다르다(오늘이 무슨 요일이냐에 따라
              그리드 1주차 칸 수가 달라짐). "N주차" 라는 이름 자체가 두 그리드를 하나로
              착각하게 만들어서, 아예 각 버킷을 실제 날짜 범위로만 표시한다. */}
          {data.weeks.map((w) => (
            <li key={w.index}>
              {fmtMD(w.startDate)}~{fmtMD(w.endDate)} — 잘 맞는 날 {w.good}일 · 챙길 날 {w.caution}일
            </li>
          ))}
        </ul>
      </section>

      <PartnerSlot />
    </main>
  );
}
