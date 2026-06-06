import type { MonthlyReport } from "@/lib/fortune/monthly-report";

export default function MonthlyTimingCard({ report }: { report: MonthlyReport }) {
  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
      {/* 주목할 시기 */}
      <div className="flex items-center gap-[7px] mb-2.5">
        <span className="text-[13px] opacity-85">📌</span>
        <span className="text-[12.5px] font-extrabold text-[#4A4458]">주목할 시기</span>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="rounded-2xl bg-[#F3F7F2] px-3.5 py-3">
          <div className="text-[11px] font-extrabold text-[#3F8E5C] mb-1">흐름이 좋아</div>
          <p className="text-[12.5px] leading-[1.7] text-[#4F4A5E] whitespace-pre-line">{report.timing.good}</p>
        </div>
        <div className="rounded-2xl bg-[#FBF4EE] px-3.5 py-3">
          <div className="text-[11px] font-extrabold text-[#C2723E] mb-1">점검할 때</div>
          <p className="text-[12.5px] leading-[1.7] text-[#4F4A5E] whitespace-pre-line">{report.timing.caution}</p>
        </div>
      </div>

      {/* 이번 달 챙길 점 */}
      <div className="pt-[18px] mt-[18px] border-t border-lilac-mid/25">
        <div className="flex items-center gap-[7px] mb-1.5">
          <span className="text-[13px] opacity-85">⚖️</span>
          <span className="text-[12.5px] font-extrabold text-[#4A4458]">이번 달 챙길 점</span>
        </div>
        <div className="flex flex-col gap-[9px]">
          <div className="flex gap-[9px] items-start text-[13px] leading-[1.7] text-[#4F4A5E]">
            <span className="shrink-0 text-[11px] font-extrabold text-[#3F8E5C] mt-0.5">좋아</span>
            <span>{report.balance.good}</span>
          </div>
          <div className="flex gap-[9px] items-start text-[13px] leading-[1.7] text-[#4F4A5E]">
            <span className="shrink-0 text-[11px] font-extrabold text-[#C2723E] mt-0.5">주의</span>
            <span>{report.balance.warn}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
