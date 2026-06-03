"use client";

import { useMemo, useState } from "react";
import type { SajuInput, SajuGender } from "@/lib/saju/calc";

// 12지지 시간 매핑 — 각 시진 시작값을 manseryeok hour 로 전달.
// 학설별 조자시/야자시 차이는 MVP 후 검토.
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

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1900;
const MAX_YEAR = CURRENT_YEAR;

export interface SajuInputFormInitial {
  year: number;
  month: number;
  day: number;
  hour: number | null;
  isLunar: boolean;
  isLeapMonth: boolean;
  gender: SajuGender;
}

export interface SajuInputFormProps {
  onSubmit: (input: SajuInput) => void;
  loading?: boolean;
  initial?: SajuInputFormInitial;
  submitLabel?: string;
}

export default function SajuInputForm({
  onSubmit,
  loading,
  initial,
  submitLabel,
}: SajuInputFormProps) {
  const today = new Date();
  const [year, setYear] = useState<number>(initial?.year ?? today.getFullYear() - 30);
  const [month, setMonth] = useState<number>(initial?.month ?? 1);
  const [day, setDay] = useState<number>(initial?.day ?? 1);
  const [hourValue, setHourValue] = useState<string>(
    initial?.hour !== null && initial?.hour !== undefined
      ? String(initial.hour)
      : HOUR_UNKNOWN
  ); // "unknown" 또는 시진 hour 값
  const [calendar, setCalendar] = useState<"solar" | "lunar">(
    initial?.isLunar ? "lunar" : "solar"
  );
  const [isLeapMonth, setIsLeapMonth] = useState<boolean>(initial?.isLeapMonth ?? false);
  const [gender, setGender] = useState<SajuGender>(initial?.gender ?? "male");

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = MAX_YEAR; y >= MIN_YEAR; y--) arr.push(y);
    return arr;
  }, []);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1),
    []
  );

  const daysInMonth = useMemo(() => {
    // 윤년 + 월별 일수 (음력은 라이브러리가 알아서 처리, UI 는 양력 기준 보수적으로 31일)
    const lastDay = new Date(year, month, 0).getDate(); // 양력 기준
    return Array.from({ length: lastDay }, (_, i) => i + 1);
  }, [year, month]);

  // day 가 월말보다 크면 자동 보정
  if (day > daysInMonth.length) {
    setDay(daysInMonth.length);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isUnknown = hourValue === HOUR_UNKNOWN;
    const hour = isUnknown ? null : parseInt(hourValue, 10);

    onSubmit({
      year,
      month,
      day,
      hour,
      minute: isUnknown ? null : 0,
      isLunar: calendar === "lunar",
      isLeapMonth: calendar === "lunar" ? isLeapMonth : false,
      gender,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto px-5 flex flex-col gap-5">
      {/* 양/음력 토글 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold text-eye-purple mb-1">
          달력
        </legend>
        <div className="flex gap-2">
          {(["solar", "lunar"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCalendar(c)}
              className={`flex-1 py-2.5 rounded-xl text-[14px] font-bold transition ${
                calendar === c
                  ? "bg-lilac-deep text-white"
                  : "bg-cream-warm text-text-light border border-lilac-mid/40"
              }`}
            >
              {c === "solar" ? "양력" : "음력"}
            </button>
          ))}
        </div>
        {calendar === "lunar" && (
          <label className="flex items-center gap-2 text-[12px] text-text-light mt-1">
            <input
              type="checkbox"
              checked={isLeapMonth}
              onChange={(e) => setIsLeapMonth(e.target.checked)}
              className="w-4 h-4 accent-lilac-deep"
            />
            윤달이야
          </label>
        )}
      </fieldset>

      {/* 생년월일 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold text-eye-purple mb-1">
          생년월일
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="px-2 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="px-2 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
          <select
            value={day}
            onChange={(e) => setDay(parseInt(e.target.value, 10))}
            className="px-2 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
          >
            {daysInMonth.map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* 태어난 시간 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold text-eye-purple mb-1">
          태어난 시간
        </legend>
        <select
          value={hourValue}
          onChange={(e) => setHourValue(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px]"
        >
          <option value={HOUR_UNKNOWN}>시간 몰라요</option>
          {HOUR_BRANCHES.map((b) => (
            <option key={b.hour} value={b.hour}>
              {b.label} {b.hanja} ({b.range})
            </option>
          ))}
        </select>
        {hourValue === HOUR_UNKNOWN && (
          <p className="text-[11px] text-text-light/80 leading-relaxed mt-1">
            괜찮아, 시간 모르면 시주는 참고용으로 짚어볼게.
          </p>
        )}
      </fieldset>

      {/* 성별 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold text-eye-purple mb-1">
          성별
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { v: "male", label: "남성" },
              { v: "female", label: "여성" },
              { v: "other", label: "기타" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setGender(opt.v)}
              className={`py-2.5 rounded-xl text-[14px] font-bold transition ${
                gender === opt.v
                  ? "bg-lilac-deep text-white"
                  : "bg-cream-warm text-text-light border border-lilac-mid/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "별콩이가 펼치는 중…" : (submitLabel ?? "사주 펼쳐보기")}
      </button>
    </form>
  );
}
