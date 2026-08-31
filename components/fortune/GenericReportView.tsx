import type { GenericReport } from "@/lib/fortune/generic-report";
import type { SajuResult } from "@/lib/saju/calc";
import type { FortuneType } from "@/lib/fortune/types";
import { MarkdownLite } from "@/lib/markdown-lite";
import { splitHeadingEmoji } from "@/lib/fortune/heading";
import SajuSummaryChips from "./SajuSummaryChips";
import ElementChart from "./ElementChart";
import ElementCycleDiagram from "./ElementCycleDiagram";
import DaeunTable from "./DaeunTable";
import ReportAccordion, { type AccordionItem } from "./ReportAccordion";

// 오행 상생상극도를 노출할 종목 — 오행 구성이 주제인 리포트만(모든 사주 리포트에 넣으면 과함).
const ELEMENT_FOCUSED: ReadonlySet<string> = new Set(["element_balance", "nature_self", "life_full"]);

// 섹션 본문 총합이 이 글자수 이상이면 아코디언(접기) 적용. 미만이면 오늘처럼 전부 펼침.
// (짧은 리포트를 접으면 오히려 초라해 보임 — 실측: nature_self 5.8k·life_full 14.6k / fact_bomb·past_life 짧음)
const ACCORDION_MIN_BODY_CHARS = 4500;

// 펼친 섹션 카드 — 아이콘 헤더 + 마크다운. 짧은 리포트(플랫 모드)용.
function SectionCard({ heading, body }: { heading: string; body: string }) {
  const { emoji, title } = splitHeadingEmoji(heading);
  return (
    <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
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
      <MarkdownLite text={body} className="text-[13.5px] leading-[1.9] text-[#4F4A5E]" />
    </div>
  );
}

// 공용 섹션 리포트 렌더 — 요약 칩·오행차트·intro·대운표·한마디는 항상 노출.
// 섹션 본문이 길면(≥4.5k자) 아코디언으로 접어 스크롤 완화, 짧으면 전부 펼침.
export default function GenericReportView({
  report,
  accentEmoji,
  saju,
  type,
}: {
  report: GenericReport;
  accentEmoji?: string;
  /** 있으면 상단 요약 칩 + 오행 분포 차트(+대운 표) 노출(전부 결정론). */
  saju?: SajuResult | null;
  /** 운세 종류 — 오행 중심 종목에만 상생상극도 노출. */
  type?: FortuneType | null;
}) {
  const bodyChars = report.sections.reduce((n, s) => n + s.body.length, 0);
  const useAccordion = bodyChars >= ACCORDION_MIN_BODY_CHARS && report.sections.length > 1;
  const items: AccordionItem[] = report.sections.map((s, i) => ({
    key: String(i),
    heading: s.heading,
    body: s.body,
  }));

  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {/* 상단 항상 노출: 요약 칩 + 오행 분포 + 도입 */}
      {saju && (
        <div className="-mb-1">
          <SajuSummaryChips saju={saju} />
        </div>
      )}
      {saju && <ElementChart saju={saju} />}
      {saju && type && ELEMENT_FOCUSED.has(type) && <ElementCycleDiagram saju={saju} />}
      <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
        <MarkdownLite text={report.intro} className="text-[14px] leading-[1.9] text-[#4F4A5E]" />
      </div>

      {/* 대운 10년 흐름 표 (결정론 십신 테마 + LLM 개인화 한 줄, life_full 등 daeun 있는 상품만) */}
      {saju && saju.daeun && saju.daeun.length > 0 && (
        <DaeunTable daeun={saju.daeun} dayStem={saju.dayStem} lines={report.daeunLines} />
      )}

      {/* 섹션 — 길면 아코디언, 짧으면 전부 펼침 */}
      {useAccordion ? (
        <ReportAccordion items={items} />
      ) : (
        report.sections.map((s, i) => <SectionCard key={i} heading={s.heading} body={s.body} />)
      )}

      {/* 별콩이 한마디 — 항상 노출 */}
      <div
        className="rounded-3xl px-6 py-6 text-white"
        style={{ background: "linear-gradient(140deg, #2A1F4D, #1F1735)" }}
      >
        <h3 className="text-[14px] font-bold text-gold mb-2">{accentEmoji ?? "🌙"} 별콩이의 한마디</h3>
        <MarkdownLite text={report.note} tone="dark" className="text-[13.5px] leading-[1.95] text-white/90" />
      </div>
    </div>
  );
}
