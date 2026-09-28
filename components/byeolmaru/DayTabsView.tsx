"use client";

// components/byeolmaru/DayTabsView.tsx — 날짜 상세의 껍데기.
// 🔴 이 화면에서 /api/byeolmaru/calendar 를 부르는 곳은 **여기 하나뿐**이다. 세 View 는 그 결과를
//    prop 으로 받아 자기 fetch 를 건너뛴다(A′ 데이터 주입형) — 탭을 오갈 때 재호출·로딩이
//    생기면 "오가기"라는 목적 자체가 깨진다.
// 🔴 **응답을 해석하지 않는다.** status 와 body 를 그대로 넘기고 판단은 각 View 가 한다 —
//    세 View 의 분기가 서로 다르기 때문이다(타로는 404 여도 화면이 뜬다: 오늘 타로는 생일이
//    필요 없고, 라우트가 404 에도 entitled/trialUsed 를 실어 보낸다). 껍데기가 404 를 접으면
//    생일 없는 사람의 타로 탭이 죽는다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { DAY_TABS, type DayTab } from "@/lib/byeolmaru/day-tabs";
import BackHeader from "./BackHeader";
import SajuTodayView from "./SajuTodayView";
import TarotTodayView from "./TarotTodayView";
import WooriTodayView from "./WooriTodayView";

/** 세 View 가 공유하는 주입 형태 — 라우트 응답 그대로. */
export interface InjectedCalendar {
  status: number;
  body: unknown;
}

export default function DayTabsView({ initialDate, initialTab }: { initialDate?: string; initialTab: DayTab }) {
  const router = useRouter();
  const [tab, setTab] = useState<DayTab>(initialTab);
  const [injected, setInjected] = useState<InjectedCalendar | null>(null);
  const [failed, setFailed] = useState(false);
  // 🔴 한 번 연 탭만 마운트를 유지한다(lazy + keep-alive). 안 연 탭은 마운트 자체를 안 하므로
  //    초기 비용은 통합 전과 같고, 열었던 탭은 언마운트하지 않아 리포트 재요청·상태 초기화가
  //    없다. Set 을 state 로 들면 렌더마다 새 참조가 생기니 ref 에 둔다(setTab 이 렌더를 부른다).
  const opened = useRef<Set<DayTab>>(new Set([initialTab]));

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
        setInjected({ status: res.status, body: await res.json().catch(() => null) });
      } catch {
        // 네트워크 자체가 죽은 경우 — 각 View 에 넘길 body 가 없다. 여기서만 화면을 책임진다.
        setFailed(true);
      }
    })();
  }, []);

  // 🔴 initialTab 은 useState 초기값이라 URL 이 바뀌어도 탭이 안 따라온다 — 같은 화면 안의
  //    크로스링크(예: 사주 상세의 "그날 카드 보러가기")가 ?tab= 만 바꿔 오기 때문에 필요하다.
  //    opened 에도 넣어야 그 탭이 실제로 마운트된다.
  useEffect(() => {
    opened.current.add(initialTab);
    setTab(initialTab);
  }, [initialTab]);

  const today =
    injected && injected.body && typeof injected.body === "object"
      ? ((injected.body as { today?: string }).today ?? null)
      : null;

  function changeTab(next: DayTab) {
    if (next === tab) return;
    // offset = 오늘로부터의 일수(과거 음수). 날짜가 없으면 오늘을 보는 중이라 0.
    const offset =
      today && initialDate
        ? Math.round((Date.parse(`${initialDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
        : 0;
    trackUiEvent("byeolmaru_day_tab_changed", { meta: { from: tab, to: next, offset } });
    opened.current.add(next);
    setTab(next);
    // 🔴 replace 다 — push 면 탭을 3번 바꾼 뒤 뒤로가기를 3번 눌러야 달력으로 빠져나온다.
    //    주소는 바뀌므로 복사·공유는 그대로 된다.
    const qs = new URLSearchParams();
    if (initialDate) qs.set("date", initialDate);
    if (next !== "saju") qs.set("tab", next);
    const q = qs.toString();
    router.replace(q ? `/byeolmaru/day?${q}` : "/byeolmaru/day", { scroll: false });
  }

  if (failed) {
    return (
      <main className="mx-auto w-full max-w-md px-4 pb-8 pt-3">
        <BackHeader />
        <p className="mt-10 text-center text-text-light">지금은 못 불러왔어. 잠깐 뒤에 다시 와줄래?</p>
      </main>
    );
  }
  if (!injected) {
    return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">펼치는 중…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-8 pt-3">
      <BackHeader />
      {/* 🔴 `mt-1` 은 눈으로 보이는 간격과 다르다 — 위 BackHeader 의 링크가 탭 타깃으로
          `py-2`(8px)를 가지므로 글자 기준 간격은 4+8=12px 다. 4px 로 보이진 않으니
          여기를 더 줄일 때는 그 py-2 까지 같이 볼 것(뺀다면 탭 타깃이 18px 로 주저앉는다). */}
      <nav aria-label="날짜 상세 탭" className="mt-1 flex gap-1 rounded-2xl bg-lilac-soft/50 p-1">
        {DAY_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => changeTab(t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            className={
              "flex-1 rounded-xl py-2 text-[14px] font-semibold transition " +
              (t.key === tab ? "bg-white text-eye-purple shadow-sm" : "text-text-light active:scale-[0.97]")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>
      {DAY_TABS.map((t) =>
        opened.current.has(t.key) ? (
          // 🔴 `mt-4` 가 **탭 칩과 본문 사이 유일한 간격**이다(2026-09-27). 세 View 의 루트가
          //    전부 `space-y-4` 라 자기 위쪽 여백이 없어, 여기가 없으면 첫 카드가 칩에 딱 붙는다
          //    (사주에서 맨 위 "이번 달 잘 맞는 날" 줄을 걷어내며 실제로 그렇게 됐다).
          //    한 곳이라 사주·타로·우리가 같은 값을 갖는다 — View 별로 흩어놓지 말 것.
          <div key={t.key} hidden={t.key !== tab} className="mt-4">
            {t.key === "saju" && <SajuTodayView initialDate={initialDate} injected={injected} />}
            {t.key === "tarot" && <TarotTodayView initialDate={initialDate} injected={injected} />}
            {t.key === "woori" && <WooriTodayView initialDate={initialDate} injected={injected} />}
          </div>
        ) : null
      )}
    </main>
  );
}
