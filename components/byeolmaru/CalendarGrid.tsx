"use client";

import type { DayCell } from "@/lib/byeolmaru/calendar";
import type { DayTone } from "@/lib/byeolmaru/day-score";

// 등급 색 — 오행 색(SajuBoard ELEMENT_COLORS)과 섞이지 않게 별콩이 톤 3단계만 쓴다.
const TONE_BG: Record<DayTone, string> = {
  good: "bg-gold-soft",
  normal: "bg-lilac-soft",
  caution: "bg-cream-warm",
};
const TONE_RING: Record<DayTone, string> = {
  good: "ring-gold",
  normal: "ring-lilac",
  caution: "ring-lilac-mid",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  cells: DayCell[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export default function CalendarGrid({ cells, selectedDate, onSelect }: Props) {
  if (cells.length === 0) return null;

  // 첫 셀의 요일만큼 앞을 비워 요일 열을 맞춘다(월 경계는 무시 — 오늘부터 30일).
  const firstWeekday = new Date(`${cells[0].date}T00:00:00`).getDay();
  const blanks = Array.from({ length: firstWeekday }, (_, i) => i);

  return (
    <div className="rounded-2xl bg-cream-warm p-3">
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-text-light">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {cells.map((c) => {
          const selected = c.date === selectedDate;
          return (
            <button
              key={c.date}
              type="button"
              onClick={() => onSelect(c.date)}
              aria-label={`${c.date} ${c.grade.label}`}
              aria-pressed={selected}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl ${TONE_BG[c.grade.tone]} ${
                selected ? `ring-2 ${TONE_RING[c.grade.tone]}` : ""
              } ${c.isToday ? "ring-2 ring-lilac-deep" : ""}`}
            >
              <span className="text-sm font-semibold text-eye-purple">
                {Number(c.date.slice(8, 10))}
              </span>
              <span className="text-[10px] text-text-light">{c.ganji}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
