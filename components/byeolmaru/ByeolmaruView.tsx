"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import CalendarGrid from "./CalendarGrid";
import DayDetailCard from "./DayDetailCard";
import PartnerSlot from "./PartnerSlot";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  weeks: WeekBucket[];
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

  useEffect(() => {
    void fetch("/api/byeolmaru/calendar", { cache: "no-store" })
      .then(async (res) => {
        // 401 은 "지금 못 펼쳤어"(error) 로 뭉뚱그리지 않는다 — 재시도로는 절대 안 풀리는
        // 로그인 문제라 전용 상태로 분리한다. 별마루가 하단 탭에 들어가면 비로그인 진입이
        // 흔한 경로가 된다(별도 code:"LOGIN_REQUIRED" 를 라우트가 이미 내려주고 있다).
        if (res.status === 401) {
          trackUiEvent("byeolmaru_need_login");
          return setState({ kind: "need_login" });
        }
        if (res.status === 404) {
          trackUiEvent("byeolmaru_no_profile");
          return setState({ kind: "no_profile" });
        }
        if (!res.ok) return setState({ kind: "error" });
        const data: CalendarResponse = await res.json();
        // tsconfig 의 noUncheckedIndexedAccess 가 꺼져 있어 data.cells[0] 은 배열이 비어도
        // 타입상 DayCell 로 보인다 — 런타임 undefined 를 못 잡고 DayDetailCard 가
        // cell.isToday 에서 크래시한다. 지금은 라우트가 빈 캘린더면 500 을 내서 못 만나지만
        // 그건 다른 파일의 계약이고 타입 시스템은 그 회귀를 못 잡아주니 여기서 직접 막는다.
        if (data.cells.length === 0) return setState({ kind: "error" });
        setState({ kind: "ready", data });
        setSelected(data.today);
      })
      .catch(() => setState({ kind: "error" }));
  }, []);

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
