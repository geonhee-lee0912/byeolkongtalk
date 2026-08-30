import type { ReportCardReport } from "@/lib/fortune/report-card-report";

// 성적표 학점 색 — 앞글자 기준(A 초록 / B 파랑 / C 골드 / D·F 로즈).
function gradeColor(grade: string): { bg: string; fg: string } {
  const g = grade.trim().toUpperCase()[0];
  if (g === "S" || g === "A") return { bg: "#E4F3E9", fg: "#3F8C66" };
  if (g === "B") return { bg: "#E6EFFA", fg: "#4A78B8" };
  if (g === "C") return { bg: "#FBF1DA", fg: "#B5843F" };
  return { bg: "#FBE9EC", fg: "#C25A6E" };
}

export default function ReportCardView({ report }: { report: ReportCardReport }) {
  const total = gradeColor(report.totalGrade);
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {/* 도입 */}
      <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
        <p className="text-[14px] leading-[1.9] text-[#4F4A5E] whitespace-pre-line">{report.intro}</p>
      </div>

      {/* 성적표 카드 (공유용) */}
      <div className="bg-white rounded-3xl border border-lilac-mid/30 shadow-[0_8px_30px_rgba(40,30,70,0.10)] px-[22px] py-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-extrabold text-eye-purple">🏆 사주 성적표</h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-light">종합</span>
            <span
              className="text-[18px] font-black px-3 py-0.5 rounded-xl tabular-nums"
              style={{ background: total.bg, color: total.fg }}
            >
              {report.totalGrade}
            </span>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-[#F0EEF4]">
          {report.scores.map((s, i) => {
            const c = gradeColor(s.grade);
            return (
              <div key={i} className="flex items-start gap-3 py-3">
                <span
                  className="text-[15px] font-black w-11 text-center py-1 rounded-lg shrink-0 tabular-nums"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {s.grade}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[#4A4458]">{s.domain}</div>
                  <p className="text-[12.5px] text-[#4F4A5E] leading-[1.7] mt-0.5 whitespace-pre-line">{s.comment}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-[#F0EEF4]">
          <div className="text-[12px] font-bold text-lilac-deep mb-1">📝 담임 총평</div>
          <p className="text-[13px] text-[#4F4A5E] leading-[1.85] whitespace-pre-line">{report.totalComment}</p>
        </div>
      </div>

      {/* 별콩이 한마디 */}
      <div className="rounded-3xl px-6 py-6 text-white" style={{ background: "linear-gradient(140deg, #2A1F4D, #1F1735)" }}>
        <h3 className="text-[14px] font-bold text-gold mb-2">🌙 별콩이의 한마디</h3>
        <p className="text-[13.5px] leading-[1.95] text-white/90 whitespace-pre-line">{report.note}</p>
      </div>
    </div>
  );
}
