"use client";

import type { SajuResult } from "@/lib/saju/calc";

type FiveElement = "목" | "화" | "토" | "금" | "수";

// SajuBoard 와 동일한 톤 (cream/lilac/gold)
const ELEMENT_BG: Record<FiveElement, string> = {
  목: "#D8E8C9",
  화: "#F4CFC4",
  토: "#F4E0B8",
  금: "#E5E5EA",
  수: "#C8CFE5",
};
const ELEMENT_TEXT: Record<FiveElement, string> = {
  목: "#3D5C2B",
  화: "#7C3527",
  토: "#6E4F1C",
  금: "#4A4A52",
  수: "#27325A",
};

function stemElement(s: string): FiveElement {
  if (s === "갑" || s === "을") return "목";
  if (s === "병" || s === "정") return "화";
  if (s === "무" || s === "기") return "토";
  if (s === "경" || s === "신") return "금";
  return "수";
}

function branchElement(b: string): FiveElement {
  if (b === "인" || b === "묘") return "목";
  if (b === "사" || b === "오") return "화";
  if (b === "진" || b === "축" || b === "술" || b === "미") return "토";
  if (b === "신" || b === "유") return "금";
  return "수";
}

export interface SajuBoardCompactProps {
  saju: SajuResult;
}

const PILLARS: { key: "year" | "month" | "day" | "hour"; label: string }[] = [
  { key: "year", label: "연" },
  { key: "month", label: "월" },
  { key: "day", label: "일" },
  { key: "hour", label: "시" },
];

export default function SajuBoardCompact({ saju }: SajuBoardCompactProps) {
  return (
    <div className="flex items-center gap-1.5">
      {PILLARS.map(({ key, label }) => {
        const p = saju.pillars[key];
        const stemEl = stemElement(p.stem);
        const branchEl = branchElement(p.branch);
        const isDay = key === "day";
        return (
          <div key={key} className="flex flex-col items-center">
            <div className="text-[9px] text-text-light/80 mb-0.5">
              {label}
              {isDay && <span className="text-gold ml-0.5">★</span>}
            </div>
            <div className="flex flex-col rounded-md overflow-hidden">
              <div
                className="px-1.5 py-0.5 text-[13px] font-bold font-serif"
                style={{
                  backgroundColor: ELEMENT_BG[stemEl],
                  color: ELEMENT_TEXT[stemEl],
                }}
              >
                {p.hanja[0]}
              </div>
              <div
                className="px-1.5 py-0.5 text-[13px] font-bold font-serif border-t border-white/40"
                style={{
                  backgroundColor: ELEMENT_BG[branchEl],
                  color: ELEMENT_TEXT[branchEl],
                }}
              >
                {p.hanja[1]}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
