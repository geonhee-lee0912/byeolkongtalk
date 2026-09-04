"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import CalendarGrid from "./CalendarGrid";
import DayDetailCard from "./DayDetailCard";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  weeks: WeekBucket[];
}

type State =
  | { kind: "loading" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; data: CalendarResponse };

export default function ByeolmaruView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/byeolmaru/calendar", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) return setState({ kind: "no_profile" });
        if (!res.ok) return setState({ kind: "error" });
        const data: CalendarResponse = await res.json();
        setState({ kind: "ready", data });
        setSelected(data.today);
      })
      .catch(() => setState({ kind: "error" }));
  }, []);

  if (state.kind === "loading") {
    return <p className="p-6 text-center text-text-light">별마루를 펼치고 있어…</p>;
  }
  if (state.kind === "no_profile") {
    return (
      <div className="p-6 text-center">
        <p className="mb-4 text-eye-purple">생년월일을 알려주면 네 달력을 그려줄게.</p>
        <Link href="/fortune" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">
          생년월일 입력하러 가기
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return <p className="p-6 text-center text-text-light">지금은 별마루를 못 펼쳤어. 잠시 뒤에 다시 와줄래?</p>;
  }

  const { data } = state;
  const cell = data.cells.find((c) => c.date === selected) ?? data.cells[0];

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">
          오늘 들어온 두 글자 · {data.todayGanji}
        </p>
      </header>

      <CalendarGrid cells={data.cells} selectedDate={cell.date} onSelect={setSelected} />
      <DayDetailCard cell={cell} />

      <section className="rounded-2xl bg-cream-warm p-4">
        <h2 className="mb-2 font-display text-base text-eye-purple">앞으로 4주 흐름</h2>
        <ul className="space-y-1 text-sm text-text-light">
          {data.weeks.map((w) => (
            <li key={w.index}>
              {w.index}주차 — 잘 맞는 날 {w.good}일 · 챙길 날 {w.caution}일
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
