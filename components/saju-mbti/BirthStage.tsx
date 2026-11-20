"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Dropdown from "@/components/common/Dropdown";
import { lunarLeapMonth, maxBirthDay } from "@/lib/saju/lunar-table";
import { birthTimeToBranchHour, type ProfileItem } from "@/components/mypage/sajuShared";

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
  // 저장된 내 사주(대표 프로필)가 있으면 그 생일로 미리 채운다(디자인 다듬기 사주 MBTI ③ B1, 운영자 11-20 — 기능 변경).
  // 비로그인·생일 없음이면 예전처럼 기본값. 불러오기 전에 사용자가 이미 고쳤으면 덮어쓰지 않는다.
  const [prefilled, setPrefilled] = useState(false);
  const touched = useRef(false);
  const touch = () => {
    touched.current = true;
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/profiles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { profiles?: ProfileItem[] } | null) => {
        const me = j?.profiles?.find((x) => x.isPrimary);
        const m = me?.birthDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!alive || !me || !m || touched.current) return;
        const y = Number(m[1]);
        if (y < MIN_YEAR || y > CURRENT_YEAR) return;
        setYear(y);
        setMonth(Number(m[2]));
        setDay(Number(m[3]));
        setCalendar(me.isLunarInput ? "lunar" : "solar");
        setIsLeapMonth(me.isLunarInput && me.isLeapMonth);
        const h = birthTimeToBranchHour(me.birthTime);
        setHourValue(h === null ? HOUR_UNKNOWN : String(h));
        setPrefilled(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const yearOptions = useMemo(() => {
    const arr: { value: string; label: string }[] = [];
    for (let y = CURRENT_YEAR; y >= MIN_YEAR; y--) arr.push({ value: String(y), label: `${y}년` });
    return arr;
  }, []);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` })), []);
  // 🔴 음력은 그해 그달 실제 일수 — SajuInputForm 과 같은 규칙(lib/saju/lunar-table.ts). 없는 날짜는
  //    calcSaju 가 클릭 핸들러에서 throw 해 "결과 보기"가 무반응이었다. 여기는 저장이 없지만 폼 규칙을 하나로 둔다 —
  //    그래서 음력 2/30·양력 평년의 음력 2/29 는 예전처럼 못 고른다(저장하는 폼의 DATE 상한, specs/2026-10-02-음력-무효날짜-design.md §8-1).
  const daysInMonth = useMemo(
    () => maxBirthDay(year, month, calendar === "lunar", isLeapMonth),
    [year, month, calendar, isLeapMonth],
  );
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
  // 윤달은 그해 윤달이 이 달일 때만 — 아니면 자동 해제.
  const leapAvailable = calendar === "lunar" && lunarLeapMonth(year) === month;
  if (isLeapMonth && !leapAvailable) setIsLeapMonth(false);

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
      {/* 머리는 문항 화면과 같은 모양 — 꽉 찬 보라 막대 + '마지막' + 굵은 제목 왼쪽(디자인 다듬기 사주 MBTI ③ B1) */}
      <div>
        <div className="flex justify-end mb-2">
          <span className="text-13 font-bold text-accent">마지막</span>
        </div>
        <div className="h-1.5 bg-lilac-soft rounded-full overflow-hidden">
          <div className="h-full w-full bg-accent" />
        </div>
        <p className="text-17 font-bold text-eye-purple mt-6 leading-snug">네 생년월일을 알려줘</p>
        <p className="text-13 text-text-light mt-1">타고난 팔자를 펼쳐볼게.</p>
      </div>
      {prefilled && (
        <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl bg-lilac-soft/60 px-3.5 py-2.5 text-12 text-eye-purple">
          <b className="font-bold">내 사주로 채워 뒀어</b>
          <span className="text-text-light">· 다른 사람 생일이면 바꿔도 돼</span>
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-13 font-bold text-eye-purple mb-1">달력</legend>
        <div className="flex gap-2">
          {(["solar", "lunar"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { touch(); setCalendar(c); }}
              className={`flex-1 py-2.5 rounded-xl text-14 font-bold transition ${
                calendar === c ? "bg-accent text-white" : "bg-lilac-soft text-eye-purple"
              }`}
            >
              {c === "solar" ? "양력" : "음력"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-13 font-bold text-eye-purple mb-1">생년월일</legend>
        <div className="grid grid-cols-3 gap-2">
          <Dropdown ariaLabel="년" value={String(year)} onChange={(v) => { touch(); setYear(parseInt(v, 10)); }} options={yearOptions} />
          <Dropdown ariaLabel="월" value={String(month)} onChange={(v) => { touch(); setMonth(parseInt(v, 10)); }} options={monthOptions} />
          <Dropdown ariaLabel="일" value={String(day)} onChange={(v) => { touch(); setDay(parseInt(v, 10)); }} options={dayOptions} />
        </div>
        {leapAvailable && (
          <label className="flex items-center gap-2 text-12 text-text-light mt-1">
            <input type="checkbox" checked={isLeapMonth} onChange={(e) => { touch(); setIsLeapMonth(e.target.checked); }} className="w-4 h-4 accent-lilac-deep" />
            윤달이야
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-13 font-bold text-eye-purple mb-1">태어난 시간</legend>
        <Dropdown ariaLabel="태어난 시간" value={hourValue} onChange={(v) => { touch(); setHourValue(v); }} options={hourOptions} />
        {hourValue === HOUR_UNKNOWN && (
          <p className="text-11 text-text-light leading-relaxed mt-1">괜찮아, 시간 모르면 시주는 참고용으로 짚어볼게.</p>
        )}
      </fieldset>

      <button
        type="submit"
        className="btn btn-primary btn-lg mt-2"
      >
        결과 보기
      </button>
    </form>
  );
}
