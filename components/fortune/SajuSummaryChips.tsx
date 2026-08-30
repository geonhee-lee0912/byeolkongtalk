import type { SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
import { ELEMENT_COLOR } from "@/lib/fortune/element";

const ORDER: FiveElement[] = ["목", "화", "토", "금", "수"];

// 사주 요약 칩 — 전부 결정론(SajuResult 계산값). 일간·강한 기운·음양.
export default function SajuSummaryChips({ saju }: { saju: SajuResult | null }) {
  if (!saju) return null;
  const counts = saju.elementCount;
  const maxEl = ORDER.reduce((a, b) => ((counts[b] ?? 0) > (counts[a] ?? 0) ? b : a), ORDER[0]);
  const yy = saju.yinYangCount;
  const dayHanja = saju.pillars?.day?.hanja?.slice(0, 1) ?? "";
  const chips: { k: string; v: string; color?: string }[] = [
    { k: "일간", v: `${dayHanja} ${saju.dayStem}${saju.dayElement}`, color: ELEMENT_COLOR[saju.dayElement] },
    { k: "강한 기운", v: `${maxEl} ${counts[maxEl] ?? 0}개`, color: ELEMENT_COLOR[maxEl] },
    { k: "음양", v: yy.yang > yy.yin ? "양 우세" : yy.yin > yy.yang ? "음 우세" : "음양 균형" },
  ];
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {chips.map((c) => (
        <div
          key={c.k}
          className="flex items-center gap-1.5 bg-cream-warm border border-lilac-mid/25 rounded-2xl px-3 py-2"
        >
          <span className="text-[10px] font-bold text-text-light/70">{c.k}</span>
          <span className="text-[12.5px] font-bold" style={{ color: c.color ?? "#5A3E8C" }}>
            {c.v}
          </span>
        </div>
      ))}
    </div>
  );
}
