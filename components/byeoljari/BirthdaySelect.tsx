// 네이티브 <input type="date"> 대신 쓰는 년/월/일 드롭다운 — 브랜드 톤(테두리·색상·커스텀 화살표) 일치.
// value/onChange 계약: 년/월/일이 전부 채워졌을 때만 "YYYY-MM-DD", 아니면 ""(부모의 `!birth` disabled 가드 유지).
"use client";
import { useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(y: string, m: string): number {
  return y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;
}

// 브랜드 톤 셀렉트 — 네이티브 화살표 제거(appearance-none) 후 커스텀 ▼ 를 얹는다.
const SELECT_CLS =
  "w-full appearance-none rounded-xl border border-lilac bg-white px-3 py-2.5 pr-8 text-sm text-eye-purple transition focus:border-lilac-deep focus:outline-none focus:ring-2 focus:ring-lilac-deep/20";

function Field({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: number[];
}) {
  return (
    <div className="relative flex-1">
      <select className={SELECT_CLS} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-lilac-deep">
        ▼
      </span>
    </div>
  );
}

interface Props {
  value: string; // "YYYY-MM-DD" 또는 ""
  onChange: (v: string) => void;
}

export default function BirthdaySelect({ value, onChange }: Props) {
  const parsed = value.split("-");
  const [y, setY] = useState(parsed[0] ?? "");
  const [m, setM] = useState(parsed[1] ? String(Number(parsed[1])) : "");
  const [d, setD] = useState(parsed[2] ? String(Number(parsed[2])) : "");

  const now = new Date().getFullYear();
  const years = Array.from({ length: now - 1930 + 1 }, (_, i) => now - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: daysInMonth(y, m) }, (_, i) => i + 1);

  function emit(ny: string, nm: string, nd: string) {
    onChange(ny && nm && nd ? `${ny}-${pad(Number(nm))}-${pad(Number(nd))}` : "");
  }

  function handleYear(ny: string) {
    const nd = d && Number(d) > daysInMonth(ny, m) ? "" : d;
    setY(ny);
    if (nd !== d) setD(nd);
    emit(ny, m, nd);
  }

  function handleMonth(nm: string) {
    const nd = d && Number(d) > daysInMonth(y, nm) ? "" : d;
    setM(nm);
    if (nd !== d) setD(nd);
    emit(y, nm, nd);
  }

  function handleDay(nd: string) {
    setD(nd);
    emit(y, m, nd);
  }

  return (
    <div className="flex gap-2">
      <Field value={y} onChange={handleYear} placeholder="년" options={years} />
      <Field value={m} onChange={handleMonth} placeholder="월" options={months} />
      <Field value={d} onChange={handleDay} placeholder="일" options={days} />
    </div>
  );
}
