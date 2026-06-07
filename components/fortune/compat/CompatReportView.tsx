"use client";

import SajuBoard from "@/components/saju/SajuBoard";
import {
  type CompatReport,
  type CompatGrade,
  type CompatSajuPair,
} from "@/lib/fortune/compat-report";

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

const SECTION_LABELS: Record<CompatVariant, { attraction: string; conflict: string; longterm: string }> = {
  romantic: {
    attraction: "💘 끌림·성격 케미",
    conflict: "🌗 갈등 포인트",
    longterm: "🌱 장기 전망",
  },
  social: {
    attraction: "🤝 성향 케미",
    conflict: "🌗 부딪히는 지점",
    longterm: "🌱 관계의 미래",
  },
};

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
      <h3 className="text-[14px] font-bold text-lilac-deep mb-1.5">{title}</h3>
      <p className="text-[13.5px] text-[#322E3D] leading-[1.85] whitespace-pre-line">{body}</p>
    </div>
  );
}

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
        <p className="mt-3 font-display text-[19px] font-bold text-center leading-snug">
          {report.theme}
        </p>
        <div className="my-4 h-px bg-white/15" />
        <p className="text-[13.5px] leading-[1.85] text-white/90 whitespace-pre-line">
          {report.summary}
        </p>
      </div>

      {/* 두 사주판 나란히 */}
      <div className="bg-cream-warm rounded-3xl px-3 py-5 border border-lilac-mid/30">
        {saju ? (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[13px] font-bold text-eye-purple text-center mb-2">
                {saju.names.a}
              </p>
              <SajuBoard saju={saju.a} showDetail={false} />
            </div>
            <div className="flex justify-center">
              <span className="rounded-full bg-lilac-soft/60 px-3.5 py-1 text-[12px] font-bold text-lilac-deep">
                {saju.a.dayStem}({saju.a.dayElement}) ↔ {saju.b.dayStem}({saju.b.dayElement})
              </span>
            </div>
            <div>
              <p className="text-[13px] font-bold text-eye-purple text-center mb-2">
                {saju.names.b}
              </p>
              <SajuBoard saju={saju.b} showDetail={false} />
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-text-light text-center py-4">
            공유 링크에서는 사주판이 표시되지 않아
          </p>
        )}
      </div>

      {/* 오행 케미 (강조) */}
      <Card title="🔮 오행 케미" body={report.chemistry} />

      {/* 섹션 카드 3개 */}
      <Card title={labels.attraction} body={report.attraction} />
      <Card title={labels.conflict} body={report.conflict} />
      <Card title={labels.longterm} body={report.longterm} />

      {/* 관계 조언 */}
      <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
        <h3 className="text-[14px] font-bold text-lilac-deep mb-2">💡 관계를 위한 조언</h3>
        <ol className="flex flex-col gap-1.5">
          {report.advice.map((a, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] text-[#322E3D] leading-[1.7]">
              <span className="font-bold text-lilac-deep flex-shrink-0">{i + 1}.</span>
              <span>{a}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 다크 별콩이의 한마디 */}
      <div className="rounded-2xl px-5 py-5 text-white" style={{ background: DARK_GRADIENT }}>
        <h3 className="text-[14px] font-bold text-gold mb-2">🌙 별콩이의 한마디</h3>
        <p className="text-[13.5px] leading-[1.9] text-white/90 whitespace-pre-line">
          {report.note}
        </p>
      </div>
    </div>
  );
}
