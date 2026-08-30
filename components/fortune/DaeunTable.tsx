import type { DaeunPillar } from "@/lib/saju/calc";
import { ELEMENT_COLOR } from "@/lib/fortune/element";

// 대운(10년 단위) 표 — 결정론적 daeun 배열을 그대로 나열. 해석 텍스트 없음(순수 데이터).
// 넓은 표 대신 flex row 리스트라 375px 폭에서도 가로 스크롤 없이 자연 개행.
export default function DaeunTable({ daeun }: { daeun: DaeunPillar[] }) {
  if (!daeun || daeun.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
      <h3 className="text-[14.5px] font-extrabold text-eye-purple mb-4">🌌 대운 10년 흐름</h3>
      <div className="flex items-center gap-3 pb-2 border-b border-lilac-mid/30">
        <span className="w-16 flex-shrink-0 text-[10.5px] font-bold text-text-light/60">나이</span>
        <span className="w-14 flex-shrink-0 text-[10.5px] font-bold text-text-light/60 text-center">간지</span>
        <span className="flex-1 text-[10.5px] font-bold text-text-light/60 text-right">기운</span>
      </div>
      <div className="flex flex-col">
        {daeun.map((d, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-2.5 border-b border-lilac-mid/20 last:border-0"
          >
            <span className="w-16 flex-shrink-0 text-[12.5px] font-bold text-[#4F4A5E] tabular-nums">
              {d.startAge}~{d.endAge}세
            </span>
            <span className="w-14 flex-shrink-0 text-center">
              <span className="block text-[17px] font-bold text-eye-purple leading-none">{d.hanja}</span>
              <span className="block text-[10px] text-text-light mt-1">
                {d.stem}
                {d.branch}
              </span>
            </span>
            <span className="flex-1 flex items-center justify-end gap-1 text-[12.5px] font-bold">
              <span style={{ color: ELEMENT_COLOR[d.stemElement] }}>{d.stemElement}</span>
              <span className="text-text-light/40">·</span>
              <span style={{ color: ELEMENT_COLOR[d.branchElement] }}>{d.branchElement}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
