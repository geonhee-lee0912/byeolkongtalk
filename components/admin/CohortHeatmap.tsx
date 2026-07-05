// components/admin/CohortHeatmap.tsx — CSS 그리드 히트맵(누적 LTV).
type CohortRow = {
  weekStart: string;
  cohortSize: number;
  cumRevenuePerUser: number[];
  retention: { d1: number; d7: number; d30: number };
};

export function CohortHeatmap({ cohorts, weeks }: { cohorts: CohortRow[]; weeks: number }) {
  const max = Math.max(1, ...cohorts.flatMap((c) => c.cumRevenuePerUser));
  const cell = (v: number) => `rgba(159,138,208,${Math.min(0.9, v / max)})`; // lilac-deep 톤
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] border-separate border-spacing-1">
        <thead>
          <tr className="text-white/50">
            <th className="text-left px-2">가입주차</th>
            <th className="px-2">인원</th>
            <th className="px-2">D1</th>
            <th className="px-2">D7</th>
            <th className="px-2">D30</th>
            {Array.from({ length: weeks }, (_, i) => (
              <th key={i} className="px-2">W{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.weekStart}>
              <td className="px-2 text-white/80">{c.weekStart}</td>
              <td className="px-2 text-center text-white/70">{c.cohortSize}</td>
              <td className="px-2 text-center text-white/60">{c.retention.d1}%</td>
              <td className="px-2 text-center text-white/60">{c.retention.d7}%</td>
              <td className="px-2 text-center text-white/60">{c.retention.d30}%</td>
              {c.cumRevenuePerUser.map((v, i) => (
                <td key={i} className="px-2 text-center rounded" style={{ background: cell(v) }}>
                  {v ? v.toLocaleString() : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
