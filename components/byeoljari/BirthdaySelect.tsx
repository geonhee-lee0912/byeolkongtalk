// 네이티브 <input type="date"> 대신 쓰는 년/월/일 드롭다운 — 옵션 패널까지 커스텀 렌더링해 브랜드 톤(라운드·색상·스크롤) 완전 적용.
// 네이티브 <select>는 열린 옵션 목록을 브라우저/OS가 그려 스타일링이 불가능해 버튼+커스텀 패널로 교체했다.
// value/onChange 계약: 년/월/일이 전부 채워졌을 때만 "YYYY-MM-DD", 아니면 ""(부모의 `!birth` disabled 가드 유지).
"use client";
import { useEffect, useRef, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(y: string, m: string): number {
  return y && m ? new Date(Number(y), Number(m), 0).getDate() : 31;
}

// 브랜드 톤 트리거 — 네이티브 select와 동일한 필드 스타일(라운드·테두리·포커스 링)을 버튼에 그대로 얹는다.
const TRIGGER_CLS =
  "w-full rounded-xl border border-lilac bg-white px-3 py-2.5 pr-8 text-left text-sm transition focus:border-lilac-deep focus:outline-none focus:ring-2 focus:ring-lilac-deep/20";

function CustomSelect({
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 패널이 열려 있을 때만 리스너를 붙이고, 바깥 클릭 시 닫는다.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // 열릴 때 선택된 옵션을 뷰포트 안으로 스크롤(연도 목록처럼 긴 리스트 대비).
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex-1">
      <button
        type="button"
        className={`${TRIGGER_CLS} ${value ? "text-eye-purple" : "text-text-light"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {value || placeholder}
      </button>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-lilac-deep">
        ▼
      </span>
      {open && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-lilac bg-white py-1 shadow-lg"
        >
          {options.map((o) => {
            const selected = String(o) === value;
            return (
              <button
                key={o}
                type="button"
                data-selected={selected ? "true" : undefined}
                className={`w-full px-3 py-2 text-left text-sm text-eye-purple hover:bg-lilac-soft ${
                  selected ? "bg-lilac-soft font-semibold" : ""
                }`}
                onClick={() => {
                  onChange(String(o));
                  setOpen(false);
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}
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
      <CustomSelect value={y} onChange={handleYear} placeholder="년" options={years} />
      <CustomSelect value={m} onChange={handleMonth} placeholder="월" options={months} />
      <CustomSelect value={d} onChange={handleDay} placeholder="일" options={days} />
    </div>
  );
}
