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
    { k: "음양", v: yy.yang > yy.yin ? "양 우세" : yy.yin > yy.yang ? "음 우세" : "균형" },
  ];
  return (
    // 한 줄 카드 하나에 세 칸(디자인 다듬기 묶음 4 결과 T1, 운영자 11-16 — 떠 있는 카드 3개·'음양 음양 균형' 반복을 정리)
    <div className="card flex px-1 py-2.5">
      {chips.map((c, i) => (
        <div key={c.k} className={`flex-1 text-center ${i > 0 ? "border-l border-lilac-mid/35" : ""}`}>
          <p className="text-11 text-text-light">{c.k}</p>
          <p className="text-14 font-bold mt-0.5" style={{ color: c.color ?? "#5A3E8C" }}>
            {c.v}
          </p>
        </div>
      ))}
    </div>
  );
}
