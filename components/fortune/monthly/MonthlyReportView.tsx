import type { MonthlyReport } from "@/lib/fortune/monthly-report";
import MonthlyOverviewCard from "./MonthlyOverviewCard";
import MonthlyFlowCard from "./MonthlyFlowCard";
import MonthlyDomainsCard from "./MonthlyDomainsCard";
import MonthlyTimingCard from "./MonthlyTimingCard";
import MonthlyNoteCard from "./MonthlyNoteCard";

export default function MonthlyReportView({
  report,
  monthLabel,
}: {
  report: MonthlyReport;
  monthLabel: string | null;
}) {
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      <MonthlyOverviewCard report={report} monthLabel={monthLabel} />
      <MonthlyFlowCard report={report} />
      <MonthlyDomainsCard report={report} />
      <MonthlyTimingCard report={report} />
      <MonthlyNoteCard note={report.note} />
    </div>
  );
}
