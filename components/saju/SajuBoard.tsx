"use client";

import type { SajuResult } from "@/lib/saju/calc";

type FiveElement = "목" | "화" | "토" | "금" | "수";

// 별콩이 톤 (cream/lilac/gold 와 어울리는 부드러운 톤). 전통 오행 색 채도 낮춤.
const ELEMENT_COLORS: Record<FiveElement, { bg: string; text: string; bar: string }> = {
  목: { bg: "#D8E8C9", text: "#3D5C2B", bar: "#A8C88A" },
  화: { bg: "#F4CFC4", text: "#7C3527", bar: "#E89B8C" },
  토: { bg: "#F4E0B8", text: "#6E4F1C", bar: "#E8C26A" },
  금: { bg: "#FFFFFF", text: "#4A4A52", bar: "#B0B0B8" },
  수: { bg: "#C8CFE5", text: "#27325A", bar: "#7A85B0" },
};

// 시주-left 정렬 (항상). 강조는 key === "day"로 판정하므로 순서만 반전.
const PILLAR_LABELS: { key: "year" | "month" | "day" | "hour"; label: string }[] = [
  { key: "hour", label: "시주" },
  { key: "day", label: "일주" },
  { key: "month", label: "월주" },
  { key: "year", label: "연주" },
];

const ELEMENTS: FiveElement[] = ["목", "화", "토", "금", "수"];

export interface SajuBoardProps {
  saju: SajuResult;
  // false면 오행 카운트만 노출하고 일간·음양 요약은 숨김 (마이페이지 프로필 카드용)
  showDetail?: boolean;
}

function getStemElement(stem: string): FiveElement {
  // 천간 → 오행 매핑 (manseryeok 와 동일)
  if (stem === "갑" || stem === "을") return "목";
  if (stem === "병" || stem === "정") return "화";
  if (stem === "무" || stem === "기") return "토";
  if (stem === "경" || stem === "신") return "금";
  return "수"; // 임/계
}

function getBranchElement(branch: string): FiveElement {
  if (branch === "인" || branch === "묘") return "목";
  if (branch === "사" || branch === "오") return "화";
  if (branch === "진" || branch === "축" || branch === "술" || branch === "미") return "토";
  if (branch === "신" || branch === "유") return "금";
  return "수"; // 자/해
}

export default function SajuBoard({ saju, showDetail = true }: SajuBoardProps) {
  const maxCount = Math.max(...Object.values(saju.elementCount));

  return (
    <div className="w-full max-w-md mx-auto px-5">
      {/* 4기둥 그리드 */}
      <div className="grid grid-cols-4 gap-2.5 mb-6 max-w-[300px] mx-auto">
        {PILLAR_LABELS.map(({ key, label }) => {
          const pillar = saju.pillars[key];
          const stemEl = getStemElement(pillar.stem);
          const branchEl = getBranchElement(pillar.branch);
          const isDayMaster = key === "day";
          const stemHanja = pillar.hanja[0];
          const branchHanja = pillar.hanja[1];

          return (
            <div key={key} className="flex flex-col">
              <div className="text-[11px] text-text-light text-center mb-1.5">
                {label}
                {isDayMaster && (
                  <span className="ml-1 text-gold font-bold">★</span>
                )}
              </div>

              {/* 천간 */}
              <div
                className="rounded-t-xl px-2 py-3 flex flex-col items-center"
                style={{
                  backgroundColor: ELEMENT_COLORS[stemEl].bg,
                  color: ELEMENT_COLORS[stemEl].text,
                }}
              >
                <div className="text-[28px] font-bold leading-none font-sans">
                  {stemHanja}
                </div>
                <div className="text-[11px] mt-1 font-bold opacity-80">{pillar.stem}</div>
              </div>

              {/* 지지 */}
              <div
                className="rounded-b-xl px-2 py-3 flex flex-col items-center border-t border-white/30"
                style={{
                  backgroundColor: ELEMENT_COLORS[branchEl].bg,
                  color: ELEMENT_COLORS[branchEl].text,
                }}
              >
                <div className="text-[28px] font-bold leading-none font-sans">
                  {branchHanja}
                </div>
                <div className="text-[11px] mt-1 font-bold opacity-80">{pillar.branch}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 시주 모름 안내 */}
      {!saju.input.hourKnown && (
        <p className="text-[11px] text-text-light/80 text-center mb-4 -mt-3">
          시간을 몰라 시주는 참고용으로 봐줘
        </p>
      )}

      {/* 오행 한 줄 요약 */}
      <div className="bg-cream-warm rounded-xl px-3 py-2.5 border border-lilac-mid/30 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {ELEMENTS.map((el) => {
          const count = saju.elementCount[el];
          const isMax = count === maxCount && maxCount > 0;
          return (
            <span
              key={el}
              className="inline-flex items-center gap-1 text-[12px]"
            >
              <span
                className={`inline-flex w-5 h-5 rounded items-center justify-center text-[11px] font-bold ${
                  isMax ? "ring-1 ring-eye-purple/40" : ""
                }`}
                style={{
                  backgroundColor: ELEMENT_COLORS[el].bg,
                  color: ELEMENT_COLORS[el].text,
                }}
              >
                {el}
              </span>
              <span className={isMax ? "font-bold text-eye-purple" : "text-text-light"}>
                {count}
              </span>
            </span>
          );
        })}
        {showDetail && (
          <>
            <span className="text-lilac-mid/60 mx-0.5">·</span>
            <span className="text-[12px] text-text-light">
              일간 <span className="text-eye-purple font-bold">{saju.dayStem}</span>
              ({saju.dayElement})
            </span>
            <span className="text-lilac-mid/60 mx-0.5">·</span>
            <span className="text-[12px] text-text-light">
              양 {saju.yinYangCount.yang} · 음 {saju.yinYangCount.yin}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
