"use client";

import SajuBoard from "@/components/saju/SajuBoard";
import {
  type CompatReport,
  type CompatGrade,
  type CompatSajuPair,
} from "@/lib/fortune/compat-report";
import { MarkdownLite } from "@/lib/markdown-lite";
import ReportAccordion, { type AccordionItem } from "@/components/fortune/ReportAccordion";
import CompatMatchDiagram from "./CompatMatchDiagram";

const DARK_GRADIENT = "linear-gradient(140deg, #2A1F4D, #1F1735)";

const GRADE_COLOR: Record<CompatGrade, string> = {
  // 연애 궁합
  천생연분: "#E8C26A",
  찰떡궁합: "#E08AB0",
  "좋은 인연": "#9F8AD0",
  "서로 배우는 인연": "#7FB0A0",
  "노력이 필요한 인연": "#B8A8D8",
  // 인간 관계 궁합
  "환상의 케미": "#E8C26A",
  "든든한 사이": "#7FB0A0",
  "잘 맞는 사이": "#9F8AD0",
  "노력하면 좋은 사이": "#B8A8D8",
  "서로 다른 결": "#C9A6C0",
};

type CompatVariant = "romantic" | "social";

const SECTION_LABELS: Record<
  CompatVariant,
  { attraction: string; conflict: string; communication: string; longterm: string; growth: string }
> = {
  romantic: {
    attraction: "💘 끌림·성격 케미",
    conflict: "🌗 갈등 포인트",
    communication: "💬 잘 통하는 대화법",
    longterm: "🌱 장기 전망",
    growth: "🌿 관계 성장 포인트",
  },
  social: {
    attraction: "🤝 성향 케미",
    conflict: "🌗 부딪히는 지점",
    communication: "💬 소통의 결",
    longterm: "🌱 관계의 미래",
    growth: "🌿 관계 성장 포인트",
  },
};

export default function CompatReportView({
  report,
  saju,
  variant = "romantic",
}: {
  report: CompatReport;
  saju: CompatSajuPair | null;
  variant?: CompatVariant;
}) {
  const gradeColor = GRADE_COLOR[report.grade];
  const labels = SECTION_LABELS[variant];

  // 접이식 섹션 — 오행 케미부터. optional 필드는 있을 때만(구 리포트 하위호환).
  const opt = (cond: unknown, item: AccordionItem): AccordionItem[] => (cond ? [item] : []);
  const items: AccordionItem[] = [
    { key: "chemistry", heading: "🔮 오행 케미", body: report.chemistry },
    { key: "attraction", heading: labels.attraction, body: report.attraction },
    { key: "conflict", heading: labels.conflict, body: report.conflict },
    ...opt(report.communication, { key: "communication", heading: labels.communication, body: report.communication! }),
    { key: "longterm", heading: labels.longterm, body: report.longterm },
    ...opt(report.growth, { key: "growth", heading: labels.growth, body: report.growth! }),
    ...opt(report.individual, { key: "individual", heading: "👥 두 사람 각자의 모습", body: report.individual! }),
    ...opt(report.stages, { key: "stages", heading: "📈 관계 시기별 흐름", body: report.stages! }),
    ...opt(report.repair, { key: "repair", heading: "🩹 다툼과 화해의 기술", body: report.repair! }),
    ...opt(report.intimacy, { key: "intimacy", heading: "💞 애정·거리감 표현법", body: report.intimacy! }),
    ...opt(report.loveLanguage, { key: "loveLanguage", heading: "💌 서로의 사랑의 언어", body: report.loveLanguage! }),
    ...opt(report.warningSigns, { key: "warningSigns", heading: "🚦 위기 신호와 조기 대응", body: report.warningSigns! }),
    ...opt(report.badHabits, { key: "badHabits", heading: "🌵 각자 조심할 습관", body: report.badHabits! }),
    ...opt(report.spark, { key: "spark", heading: "✨ 관계에 활기를 더하는 법", body: report.spark! }),
    {
      key: "advice",
      heading: "💡 관계를 위한 조언",
      preview: report.advice[0],
      children: (
        <ol className="flex flex-col gap-1.5">
          {report.advice.map((a, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] text-[#4F4A5E] leading-[1.7]">
              <span className="font-bold text-lilac-deep flex-shrink-0">{i + 1}.</span>
              <span>{a}</span>
            </li>
          ))}
        </ol>
      ),
    },
  ];

  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {/* 다크 히어로 — 등급 배지 + 테마 + summary */}
      <div className="rounded-3xl px-5 py-6 text-white" style={{ background: DARK_GRADIENT }}>
        <div className="flex justify-center">
          <span
            className="rounded-full px-4 py-1.5 text-[13px] font-bold"
            style={{ backgroundColor: gradeColor, color: "#1F1735" }}
          >
            {report.grade}
          </span>
        </div>
        <p className="mt-3 font-display text-[19px] font-bold text-center leading-snug">{report.theme}</p>
        <div className="my-4 h-px bg-white/15" />
        <MarkdownLite text={report.summary} tone="dark" className="text-[13.5px] leading-[1.85] text-white/90" />
      </div>

      {/* 두 사주판 나란히 */}
      <div className="bg-cream-warm rounded-3xl px-3 py-5 border border-lilac-mid/30">
        {saju ? (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[13px] font-bold text-eye-purple text-center mb-2">{saju.names.a}</p>
              <SajuBoard saju={saju.a} showDetail={false} />
            </div>
            <div className="flex justify-center">
              <span className="rounded-full bg-lilac-soft/60 px-3.5 py-1 text-[12px] font-bold text-lilac-deep">
                {saju.a.dayStem}({saju.a.dayElement}) ↔ {saju.b.dayStem}({saju.b.dayElement})
              </span>
            </div>
            <div>
              <p className="text-[13px] font-bold text-eye-purple text-center mb-2">{saju.names.b}</p>
              <SajuBoard saju={saju.b} showDetail={false} />
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-text-light text-center py-4">
            공유 링크에서는 사주판이 표시되지 않아
          </p>
        )}
      </div>

      {/* 궁합 매칭도 (결정론 요약) */}
      {saju && <CompatMatchDiagram a={saju.a} b={saju.b} names={saju.names} />}

      {/* 접이식 섹션 */}
      <ReportAccordion items={items} />

      {/* 다크 별콩이의 한마디 — 항상 노출 */}
      <div className="rounded-3xl px-5 py-5 text-white" style={{ background: DARK_GRADIENT }}>
        <h3 className="text-[14px] font-bold text-gold mb-2">🌙 별콩이의 한마디</h3>
        <MarkdownLite text={report.note} tone="dark" className="text-[13.5px] leading-[1.9] text-white/90" />
      </div>
    </div>
  );
}
