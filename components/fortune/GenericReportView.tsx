import type { GenericReport } from "@/lib/fortune/generic-report";

// 공용 섹션 리포트 렌더 — intro + 섹션 카드 N개 + 별콩이 한마디.
// 신규 사주 텍스트 종목(정체성·연애·돈일·팩폭·전생·평생사주 등) 공통.
export default function GenericReportView({
  report,
  accentEmoji,
}: {
  report: GenericReport;
  accentEmoji?: string;
}) {
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {/* 도입 */}
      <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
        <p className="text-[14px] leading-[1.9] text-[#4F4A5E] whitespace-pre-line">
          {report.intro}
        </p>
      </div>

      {/* 섹션들 */}
      {report.sections.map((s, i) => (
        <div
          key={i}
          className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6"
        >
          <h3 className="text-[14.5px] font-extrabold text-lilac-deep mb-2.5">
            {s.heading}
          </h3>
          <p className="text-[13.5px] leading-[1.9] text-[#4F4A5E] whitespace-pre-line">
            {s.body}
          </p>
        </div>
      ))}

      {/* 별콩이 한마디 */}
      <div
        className="rounded-3xl px-6 py-6 text-white"
        style={{ background: "linear-gradient(140deg, #2A1F4D, #1F1735)" }}
      >
        <h3 className="text-[14px] font-bold text-gold mb-2">
          {accentEmoji ?? "🌙"} 별콩이의 한마디
        </h3>
        <p className="text-[13.5px] leading-[1.95] text-white/90 whitespace-pre-line">
          {report.note}
        </p>
      </div>
    </div>
  );
}
