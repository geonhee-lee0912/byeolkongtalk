"use client";

import { useMemo, useState } from "react";
import Dropdown from "@/components/common/Dropdown";

// 12지지 시간 매핑 (SajuInputForm 과 동일).
const HOUR_BRANCHES: { label: string; hanja: string; range: string; hour: number }[] = [
  { label: "자시", hanja: "子", range: "23-01시", hour: 0 },
  { label: "축시", hanja: "丑", range: "01-03시", hour: 2 },
  { label: "인시", hanja: "寅", range: "03-05시", hour: 4 },
  { label: "묘시", hanja: "卯", range: "05-07시", hour: 6 },
  { label: "진시", hanja: "辰", range: "07-09시", hour: 8 },
  { label: "사시", hanja: "巳", range: "09-11시", hour: 10 },
  { label: "오시", hanja: "午", range: "11-13시", hour: 12 },
  { label: "미시", hanja: "未", range: "13-15시", hour: 14 },
  { label: "신시", hanja: "申", range: "15-17시", hour: 16 },
  { label: "유시", hanja: "酉", range: "17-19시", hour: 18 },
  { label: "술시", hanja: "戌", range: "19-21시", hour: 20 },
  { label: "해시", hanja: "亥", range: "21-23시", hour: 22 },
];
const HOUR_UNKNOWN = "unknown";
const MIN_YEAR = 1900;
const CURRENT_YEAR = new Date().getFullYear();

// 사주 MBTI 팔자용 생년월일 입력. 성별은 결과에 무관해 미수집(플로우가 "other" 고정).
export interface BirthValue {
  year: number;
  month: number;
  day: number;
  hour: number | null;
  minute: number | null;
  isLunar: boolean;
  isLeapMonth: boolean;
}

export function BirthStage({ onDone }: { onDone: (birth: BirthValue) => void }) {
  const [year, setYear] = useState<number>(CURRENT_YEAR - 30);
  const [month, setMonth] = useState<number>(1);
  const [day, setDay] = useState<number>(1);
  const [hourValue, setHourValue] = useState<string>(HOUR_UNKNOWN);
  const [calendar, setCalendar] = useState<"solar" | "lunar">("solar");
  const [isLeapMonth, setIsLeapMonth] = useState<boolean>(false);

  const yearOptions = useMemo(() => {
    const arr: { value: string; label: string }[] = [];
    for (let y = CURRENT_YEAR; y >= MIN_YEAR; y--) arr.push({ value: String(y), label: `${y}년` });
    return arr;
  }, []);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` })), []);
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => ({ value: String(i + 1), label: `${i + 1}일` })),
    [daysInMonth],
  );
  const hourOptions = useMemo(
    () => [
      { value: HOUR_UNKNOWN, label: "시간 몰라요" },
      ...HOUR_BRANCHES.map((b) => ({ value: String(b.hour), label: `${b.label} ${b.hanja} (${b.range})` })),
    ],
    [],
  );

  if (day > daysInMonth) setDay(daysInMonth);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isUnknown = hourValue === HOUR_UNKNOWN;
    onDone({
      year,
      month,
      day,
      hour: isUnknown ? null : parseInt(hourValue, 10),
      minute: isUnknown ? null : 0,
      isLunar: calendar === "lunar",
      isLeapMonth: calendar === "lunar" ? isLeapMonth : false,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto px-5 py-8 flex flex-col gap-5 animate-fade-in" data-stage="birth">
      <p className="font-display text-lg text-eye-purple text-center mb-1">마지막! 네 생년월일을 알려줘</p>
      <p className="text-[13px] text-text-light text-center -mt-3 mb-1">타고난 팔자를 펼쳐볼게.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold text-eye-purple mb-1">달력</legend>
        <div className="flex gap-2">
          {(["solar", "lunar"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCalendar(c)}
              className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition ${
                calendar === c ? "bg-lilac-deep text-white" : "bg-cream-warm text-text-light border border-lilac-mid/40"
              }`}
            >
              {c === "solar" ? "양력" : "음력"}
            </button>
          ))}
        </div>
        {calendar === "lunar" && (
          <label className="flex items-center gap-2 text-[12px] text-text-light mt-1">
            <input type="checkbox" checked={isLeapMonth} onChange={(e) => setIsLeapMonth(e.target.checked)} className="w-4 h-4 accent-lilac-deep" />
            윤달이야
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold text-eye-purple mb-1">생년월일</legend>
        <div className="grid grid-cols-3 gap-2">
          <Dropdown ariaLabel="년" value={String(year)} onChange={(v) => setYear(parseInt(v, 10))} options={yearOptions} />
          <Dropdown ariaLabel="월" value={String(month)} onChange={(v) => setMonth(parseInt(v, 10))} options={monthOptions} />
          <Dropdown ariaLabel="일" value={String(day)} onChange={(v) => setDay(parseInt(v, 10))} options={dayOptions} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold text-eye-purple mb-1">태어난 시간</legend>
        <Dropdown ariaLabel="태어난 시간" value={hourValue} onChange={(v) => setHourValue(v)} options={hourOptions} />
        {hourValue === HOUR_UNKNOWN && (
          <p className="text-[11px] text-text-light/80 leading-relaxed mt-1">괜찮아, 시간 모르면 시주는 참고용으로 짚어볼게.</p>
        )}
      </fieldset>

      <button
        type="submit"
        className="mt-2 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        결과 보기 →
      </button>
    </form>
  );
}
