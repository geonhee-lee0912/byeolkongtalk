import { ELEMENT_COLOR } from "@/lib/fortune/element";
import type { MonthlyReport } from "@/lib/fortune/monthly-report";

export default function MonthlyOverviewCard({
  report,
  monthLabel,
}: {
  report: MonthlyReport;
  monthLabel: string | null;
}) {
  const { wolgeon } = report;
  const c1 = wolgeon.hanja[0] ?? wolgeon.stem;
  const c2 = wolgeon.hanja[1] ?? wolgeon.branch;
  const filled = Math.min(5, Math.max(1, report.stars));

  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
      <div className="flex items-baseline justify-between mb-5">
        <span className="text-[16px] font-bold text-[#1C1A24]">이번 달 운세</span>
        {monthLabel && (
          <span className="text-[11.5px] font-semibold text-text-light/70">{monthLabel}</span>
        )}
      </div>

      {/* 월건 히어로 */}
      <div className="text-center mb-[18px]">
        <div className="text-[52px] font-extrabold text-eye-purple leading-none tracking-[2px]">
          {wolgeon.hanja}
        </div>
        <div className="mt-[7px] text-[12px] font-semibold text-[#8B84A0]">
          {wolgeon.stem}
          {wolgeon.branch} · 이번 달 들어온 기운
        </div>
        <div className="mt-[9px] flex gap-[6px] justify-center">
          <span className="text-[10.5px] font-bold text-[#6E6880] inline-flex items-center gap-[3px]">
            <i className="w-[6px] h-[6px] rounded-full inline-block" style={{ background: ELEMENT_COLOR[wolgeon.stemElement] }} />
            {wolgeon.stemElement} {c1}
          </span>
          <span className="text-[10.5px] font-bold text-[#6E6880] inline-flex items-center gap-[3px]">
            <i className="w-[6px] h-[6px] rounded-full inline-block" style={{ background: ELEMENT_COLOR[wolgeon.branchElement] }} />
            {wolgeon.branchElement} {c2}
          </span>
        </div>
      </div>

      {/* 이번 달 테마 */}
      <p className="text-center text-[15px] font-extrabold text-eye-purple leading-[1.5] mb-[6px]">
        "{report.theme}"
      </p>
      {/* 한 줄 총평 */}
      <p className="text-center text-[14px] font-bold text-[#322E3D] leading-[1.5] mb-[14px] whitespace-pre-line">
        {report.summary}
      </p>

      {/* 종합운 별점 */}
      <div className="flex items-center justify-center gap-2 mb-[9px]">
        <span className="text-[11px] font-bold text-text-light/70">이번 달 종합운</span>
        <span className="text-[13px] tracking-[2px] text-[#C9C4D6]">
          <b className="text-eye-purple">{"★".repeat(filled)}</b>
          {"☆".repeat(5 - filled)}
        </span>
      </div>

      {/* 키워드/색 칩 */}
      <div className="flex gap-[6px] justify-center flex-wrap">
        <span className="text-[10.5px] text-[#6E6880] border border-lilac-mid/40 rounded-full px-[11px] py-1 font-semibold">
          # {report.lucky.keyword}
        </span>
        <span className="text-[10.5px] text-[#6E6880] border border-lilac-mid/40 rounded-full px-[11px] py-1 font-semibold">
          {report.lucky.color}
        </span>
      </div>
    </div>
  );
}
