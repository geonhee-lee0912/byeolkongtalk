import type { MonthlyReport } from "@/lib/fortune/monthly-report";

export default function MonthlyFlowCard({ report }: { report: MonthlyReport }) {
  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
      {/* 월건 풀이 */}
      <div className="text-[12.5px] font-extrabold text-[#4A4458] mb-1.5">이번 달 들어온 두 글자</div>
      <p className="text-[13px] leading-[1.85] text-[#4F4A5E] whitespace-pre-line">{report.intro}</p>

      {/* 주차별 흐름 */}
      <div className="pt-[18px] mt-[18px] border-t border-lilac-mid/25">
        <div className="text-[12.5px] font-extrabold text-[#4A4458] mb-3">주차별 흐름</div>
        <ol className="flex flex-col gap-[14px]">
          {report.weekly.map((w) => (
            <li key={w.week} className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-lilac-soft/60 text-eye-purple text-[11px] font-extrabold flex items-center justify-center mt-0.5">
                {w.week}주
              </span>
              <p className="flex-1 text-[13px] leading-[1.8] text-[#4F4A5E] whitespace-pre-line">
                {w.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
