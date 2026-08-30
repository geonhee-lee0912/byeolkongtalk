import type { GenericReport } from "@/lib/fortune/generic-report";
import type { SajuResult } from "@/lib/saju/calc";
import { MarkdownLite } from "@/lib/markdown-lite";
import SajuSummaryChips from "./SajuSummaryChips";

// 첫 그래핌(ZWJ·VS16 이모지 시퀀스 포함) 추출 — Intl.Segmenter, 미지원 시 코드포인트 폴백.
function firstGrapheme(s: string): string {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const g of seg.segment(s)) return g.segment;
  } catch {
    /* Intl.Segmenter 미지원 폴백 */
  }
  return [...s][0] ?? "";
}

// heading 앞 이모지를 아이콘 타일로 분리. 이모지 없으면 기본 별.
function splitHeadingEmoji(heading: string): { emoji: string; title: string } {
  const g = firstGrapheme(heading);
  const isEmoji = g !== "" && /\p{Extended_Pictographic}/u.test(g);
  if (isEmoji) return { emoji: g, title: heading.slice(g.length).trim() };
  return { emoji: "✦", title: heading };
}

// 공용 섹션 리포트 렌더 — 요약 칩 + intro + 섹션 카드(아이콘 헤더·마크다운) + 별콩이 한마디.
export default function GenericReportView({
  report,
  accentEmoji,
  saju,
}: {
  report: GenericReport;
  accentEmoji?: string;
  /** 있으면 상단 요약 칩 노출(결정론). 오행 차트를 따로 보여주는 래퍼(element_balance)는 중복 방지로 미전달. */
  saju?: SajuResult | null;
}) {
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {saju && (
        <div className="-mb-1">
          <SajuSummaryChips saju={saju} />
        </div>
      )}

      {/* 도입 */}
      <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
        <MarkdownLite
          text={report.intro}
          className="text-[14px] leading-[1.9] text-[#4F4A5E]"
        />
      </div>

      {/* 섹션들 */}
      {report.sections.map((s, i) => {
        const { emoji, title } = splitHeadingEmoji(s.heading);
        return (
          <div
            key={i}
            className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[19px] shrink-0"
                style={{ background: "linear-gradient(135deg, #F3E9DF, #EADFF2)" }}
                aria-hidden
              >
                {emoji}
              </span>
              <h3 className="text-[14.5px] font-extrabold text-eye-purple">{title}</h3>
            </div>
            <MarkdownLite
              text={s.body}
              className="text-[13.5px] leading-[1.9] text-[#4F4A5E]"
            />
          </div>
        );
      })}

      {/* 별콩이 한마디 */}
      <div
        className="rounded-3xl px-6 py-6 text-white"
        style={{ background: "linear-gradient(140deg, #2A1F4D, #1F1735)" }}
      >
        <h3 className="text-[14px] font-bold text-gold mb-2">
          {accentEmoji ?? "🌙"} 별콩이의 한마디
        </h3>
        <MarkdownLite
          text={report.note}
          tone="dark"
          className="text-[13.5px] leading-[1.95] text-white/90"
        />
      </div>
    </div>
  );
}
