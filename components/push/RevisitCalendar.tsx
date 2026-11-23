"use client";

// 다시 볼 날 시트의 달력 — 한 달씩, 위에 "YYYY년 M월 ‹ ›". 고를 수 있는 날(min~max)만 진하고 나머지는 흐리다.
// 오늘은 밑에 작은 점. 휴대폰 기본 날짜 선택창 대신 우리가 그린다(디자인 다듬기 /tarot/result ⑩, 운영자 11-15 —
// 기본 창은 기기마다 모양이 다르고 여기서 확인할 수 없었다)
import { useState } from "react";
import Icon from "@/components/common/Icon";
import { monthCells, shiftMonth } from "@/lib/push/schedule";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function RevisitCalendar({
  today,
  min,
  max,
  value,
  onChange,
  disabled,
}: {
  /** 오늘(KST, YYYY-MM-DD) */
  today: string;
  min: string;
  max: string;
  value: string | null;
  onChange: (date: string) => void;
  disabled?: boolean;
}) {
  const [month, setMonth] = useState((value ?? min).slice(0, 7));
  // 칩으로 다른 달 날짜를 고르면 그 달로 넘긴다(렌더 중 맞추기 — 효과 없이)
  const [shownFor, setShownFor] = useState(value);
  if (value !== shownFor) {
    setShownFor(value);
    if (value && value.slice(0, 7) !== month) setMonth(value.slice(0, 7));
  }
  const canPrev = month > min.slice(0, 7);
  const canNext = month < max.slice(0, 7);
  const [y, m] = month.split("-").map(Number);

  const arrow = (dir: -1 | 1, on: boolean) => (
    <button
      type="button"
      aria-label={dir < 0 ? "이전 달" : "다음 달"}
      disabled={!on}
      onClick={() => setMonth(shiftMonth(month, dir))}
      className="w-8 h-8 rounded-full flex items-center justify-center text-eye-purple disabled:text-lilac-mid/40"
    >
      <Icon name="chev_r" size={16} className={dir < 0 ? "rotate-180" : ""} />
    </button>
  );

  return (
    <div className="card px-2.5 pt-2 pb-1.5">
      <div className="flex items-center justify-between px-0.5 pb-1.5">
        {arrow(-1, canPrev)}
        <span className="text-15 font-bold">
          {y}년 {m}월
        </span>
        {arrow(1, canNext)}
      </div>
      <div className="grid grid-cols-7">
        {WEEK.map((w) => (
          <div key={w} className="text-center text-11 text-text-light pb-1">
            {w}
          </div>
        ))}
        {monthCells(month).map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const can = d >= min && d <= max;
          const on = d === value;
          return (
            <div key={d} className="h-10 flex items-center justify-center">
              <button
                type="button"
                disabled={!can || disabled}
                aria-pressed={on}
                aria-label={`${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`}
                onClick={() => onChange(d)}
                className={`relative w-9 h-9 rounded-full flex items-center justify-center text-14 ${
                  on ? "bg-accent text-white font-bold" : can ? "font-semibold" : "text-lilac-mid/60"
                }`}
              >
                {Number(d.slice(8))}
                {d === today && !on && <span className="absolute bottom-[3px] w-1 h-1 rounded-full bg-lilac-mid" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
