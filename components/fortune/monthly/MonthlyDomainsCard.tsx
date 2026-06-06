import { DAILY_SECTIONS } from "@/lib/fortune/daily-report";
import type { MonthlyReport } from "@/lib/fortune/monthly-report";

export default function MonthlyDomainsCard({ report }: { report: MonthlyReport }) {
  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
      <div className="text-[12.5px] font-extrabold text-[#4A4458]">분야별 흐름</div>
      {DAILY_SECTIONS.map((meta) => {
        const sec = report.sections.find((s) => s.key === meta.key);
        if (!sec) return null;
        return (
          <div key={meta.key} className="pt-[17px] mt-[17px] border-t border-[#F0EEF4]">
            <div className="flex items-center gap-[7px] mb-1.5">
              <span className="text-[13px] opacity-85">{meta.icon}</span>
              <span className="text-[12.5px] font-extrabold text-[#4A4458]">{meta.title}</span>
            </div>
            <p className="text-[13px] leading-[1.85] text-[#4F4A5E] whitespace-pre-line">{sec.body}</p>
          </div>
        );
      })}
    </div>
  );
}
