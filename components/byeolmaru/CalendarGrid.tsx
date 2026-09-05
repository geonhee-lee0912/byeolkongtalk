"use client";

import type { DayTone } from "@/lib/byeolmaru/day-score";
import { trackUiEvent } from "@/lib/analytics/ui-events";

// 나(DayCell)·우리(PairDayCell) 어느 쪽도 아닌 정규화 셀 — 두 판정 엔진의 톤 3단(good/normal/
// caution)이 같은 union(DayTone===PairTone)이라 호출부가 이 모양으로만 매핑해 넘기면 그리드는
// 어느 쪽 캘린더든 그대로 그린다.
export interface GridCell {
  date: string;
  ganji: string;
  tone: DayTone;
  label: string;
  isToday: boolean;
}

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
  cells: GridCell[];
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
              onClick={() => {
                trackUiEvent("byeolmaru_day_selected", {
                  meta: { offset: cells.indexOf(c), tone: c.tone },
                });
                onSelect(c.date);
              }}
              aria-label={`${c.date} ${c.label}`}
              aria-pressed={selected}
              // 오늘/선택 링을 겹치지 않게 — ring-2 는 폭만 정하고 색은 스타일시트 순서로
              // 갈려서, 겹치면 톤에 따라 "오늘" 표시가 사라졌다(예: ring-lilac-deep 이
              // ring-lilac-mid 보다 먼저 정의되면 caution 톤의 오늘 셀이 오늘 링을 잃음).
              // 우선순위를 삼항으로 코드에 고정해 매번 정확히 하나의 ring-{색} 만 나가게 한다.
              className={`flex aspect-square flex-col items-center justify-center rounded-xl ${TONE_BG[c.tone]} ${
                c.isToday
                  ? "ring-2 ring-lilac-deep"
                  : selected
                    ? `ring-2 ${TONE_RING[c.tone]}`
                    : ""
              }`}
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
