// 사주 한눈에 — 일간 한 줄 + 오행 분포 알약. SajuIdentityRow 아래에 붙여 쓴다.
// 운세 목록 '내 사주' 칸(MySajuRow)과 사주 고르기의 '고른 사주' 칸이 같은 모양을 쓴다(디자인 다듬기 묶음 4, 운영자 11-16).
import type { SajuResult } from "@/lib/saju/calc";
import { ELEMENT_COLORS, type FiveElement } from "@/lib/saju/elements";
import { dayMasterLine } from "@/lib/saju/day-master";

const ELEMENTS: FiveElement[] = ["목", "화", "토", "금", "수"];

export default function SajuGlance({ saju }: { saju: SajuResult }) {
  const line = dayMasterLine(saju.dayStem);
  return (
    <div className="border-t border-lilac-mid/30 mt-3 pt-2.5">
      {line && <p className="text-12 text-eye-purple">{line}</p>}
      <div className="flex flex-wrap gap-1 mt-2">
        {ELEMENTS.map((el) => (
          <span
            key={el}
            className="text-11 font-bold px-2 py-0.5 rounded-full border border-lilac-mid/40 tabular-nums"
            style={{ backgroundColor: ELEMENT_COLORS[el].bg, color: ELEMENT_COLORS[el].text }}
          >
            {el} {saju.elementCount[el]}
          </span>
        ))}
      </div>
    </div>
  );
}
