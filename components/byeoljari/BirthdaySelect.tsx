// 네이티브 <input type="date"> 대신 쓰는 년/월/일 드롭다운 — 브랜드 톤(테두리·색상) 일치 목적.
// value/onChange 계약: 년/월/일이 전부 채워졌을 때만 "YYYY-MM-DD"를 돌려주고, 아니면 ""
// (부모의 `!birth` disabled 가드가 그대로 작동하도록).
"use client";
import { useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(y: string, m: string): number {
  return y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;
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
      <select
        className="flex-1 rounded-lg border border-lilac px-3 py-2 text-eye-purple bg-white"
        value={y}
        onChange={(e) => handleYear(e.target.value)}
      >
        <option value="">년</option>
        {years.map((yy) => (
          <option key={yy} value={yy}>
            {yy}
          </option>
        ))}
      </select>
      <select
        className="flex-1 rounded-lg border border-lilac px-3 py-2 text-eye-purple bg-white"
        value={m}
        onChange={(e) => handleMonth(e.target.value)}
      >
        <option value="">월</option>
        {months.map((mm) => (
          <option key={mm} value={mm}>
            {mm}
          </option>
        ))}
      </select>
      <select
        className="flex-1 rounded-lg border border-lilac px-3 py-2 text-eye-purple bg-white"
        value={d}
        onChange={(e) => handleDay(e.target.value)}
      >
        <option value="">일</option>
        {days.map((dd) => (
          <option key={dd} value={dd}>
            {dd}
          </option>
        ))}
      </select>
    </div>
  );
}
