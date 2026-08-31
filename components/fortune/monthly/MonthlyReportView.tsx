import { DAILY_SECTIONS } from "@/lib/fortune/daily-report";
import type { MonthlyReport } from "@/lib/fortune/monthly-report";
import { MarkdownLite } from "@/lib/markdown-lite";
import ReportAccordion, { type AccordionItem } from "@/components/fortune/ReportAccordion";
import MonthlyOverviewCard from "./MonthlyOverviewCard";
import MonthlyNoteCard from "./MonthlyNoteCard";

export default function MonthlyReportView({
  report,
  monthLabel,
}: {
  report: MonthlyReport;
  monthLabel: string | null;
}) {
  const opt = (cond: unknown, item: AccordionItem): AccordionItem[] => (cond ? [item] : []);

  const domainItems: AccordionItem[] = DAILY_SECTIONS.flatMap((meta) => {
    const sec = report.sections.find((s) => s.key === meta.key);
    return sec ? [{ key: `dom-${meta.key}`, heading: `${meta.icon} ${meta.title}`, body: sec.body }] : [];
  });

  const items: AccordionItem[] = [
    { key: "intro", heading: "🌙 이번 달 들어온 두 글자", body: report.intro },
    {
      key: "weekly",
      heading: "🗓️ 주차별 흐름",
      preview: "1주차부터 4주차까지 이번 달 흐름",
      children: (
        <ol className="flex flex-col gap-[14px]">
          {report.weekly.map((w) => (
            <li key={w.week} className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-lilac-soft/60 text-eye-purple text-[11px] font-extrabold flex items-center justify-center mt-0.5">
                {w.week}주
              </span>
              <MarkdownLite text={w.body} className="flex-1 text-[13px] leading-[1.8] text-[#4F4A5E]" />
            </li>
          ))}
        </ol>
      ),
    },
    ...domainItems,
    ...opt(report.relationships, { key: "relationships", heading: "🤝 인간관계·귀인", body: report.relationships! }),
    ...opt(report.emotion, { key: "emotion", heading: "💗 마음·감정 컨디션", body: report.emotion! }),
    ...opt(report.action, { key: "action", heading: "🎯 이번 달 실천 포인트", body: report.action! }),
    {
      key: "timing",
      heading: "📌 주목할 시기·챙길 점",
      preview: "흐름 좋은 때와 점검할 때",
      children: (
        <div className="flex flex-col gap-2.5">
          <div className="rounded-2xl bg-[#F3F7F2] px-3.5 py-3">
            <div className="text-[11px] font-extrabold text-[#3F8E5C] mb-1">흐름이 좋아</div>
            <MarkdownLite text={report.timing.good} className="text-[12.5px] leading-[1.7] text-[#4F4A5E]" />
          </div>
          <div className="rounded-2xl bg-[#FBF4EE] px-3.5 py-3">
            <div className="text-[11px] font-extrabold text-[#C2723E] mb-1">점검할 때</div>
            <MarkdownLite text={report.timing.caution} className="text-[12.5px] leading-[1.7] text-[#4F4A5E]" />
          </div>
          <div className="flex flex-col gap-[9px] pt-1">
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
      ),
    },
  ];

  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      <MonthlyOverviewCard report={report} monthLabel={monthLabel} />
      <ReportAccordion items={items} accentIcon="/byeolkong-listen.png" />
      <MonthlyNoteCard note={report.note} />
    </div>
  );
}
