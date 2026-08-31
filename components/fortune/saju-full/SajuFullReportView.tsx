import Image from "next/image";
import SajuBoard from "@/components/saju/SajuBoard";
import ElementChart from "@/components/fortune/ElementChart";
import ElementCycleDiagram from "@/components/fortune/ElementCycleDiagram";
import YearTimeline from "@/components/fortune/YearTimeline";
import { ELEMENT_COLOR } from "@/lib/fortune/element";
import type { SajuFullReport } from "@/lib/fortune/saju-full-report";
import type { SajuResult } from "@/lib/saju/calc";
import { MarkdownLite } from "@/lib/markdown-lite";
import ReportAccordion, { type AccordionItem } from "@/components/fortune/ReportAccordion";

const DARK_GRADIENT = "linear-gradient(140deg, #2A1F4D, #1F1735)";

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c, i) => (
        <span
          key={i}
          className="bg-white border border-lilac-mid/40 rounded-full px-2.5 py-1 text-[11px] font-bold text-lilac-deep"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

const G1 = "나라는 사람";
const G2 = "2026년 총운";
const G3 = "월간 운세";
const G4 = "행운 가이드";

export default function SajuFullReportView({
  report,
  saju,
}: {
  report: SajuFullReport;
  saju: SajuResult | null;
}) {
  const dayElementColor = saju ? ELEMENT_COLOR[saju.dayElement] : ELEMENT_COLOR["화"];
  const opt = (cond: unknown, item: AccordionItem): AccordionItem[] => (cond ? [item] : []);

  const items: AccordionItem[] = [
    // ── 나라는 사람 ──
    { key: "nature", group: G1, heading: "🌱 타고난 기질·성격", body: report.self.nature },
    { key: "strength", group: G1, heading: "💎 나의 강점·빛나는 재능", body: report.self.strength },
    { key: "caution", group: G1, heading: "🌿 조심할 성향·보완점", body: report.self.caution },
    {
      key: "balance",
      group: G1,
      heading: "⚖️ 오행 밸런스 진단",
      preview: "오행 균형과 보완 키워드",
      children: (
        <div>
          <ElementChart saju={saju} className="mb-3" />
          <ElementCycleDiagram saju={saju} className="mb-3" />
          <MarkdownLite text={report.self.balance.lack} className="text-[13.5px] text-[#4F4A5E] leading-[1.85]" />
          <div className="mt-2.5">
            <Chips items={report.self.balance.supplements} />
          </div>
        </div>
      ),
    },
    { key: "aptitude", group: G1, heading: "🧭 타고난 적성·어울리는 일", body: report.self.aptitude },

    // ── 2026년 총운 ──
    { key: "flow", group: G2, heading: "🌊 2026년 큰 흐름·테마", body: report.year.flow },
    { key: "mind", group: G2, heading: "💗 마음·감정 흐름", body: report.year.mind },
    { key: "love", group: G2, heading: "💘 사랑·인연", body: report.year.love },
    { key: "relationship", group: G2, heading: "🤝 인간관계·사회", body: report.year.relationship },
    { key: "career", group: G2, heading: "💼 일·커리어", body: report.year.career },
    { key: "wealth", group: G2, heading: "💰 재물·금전", body: report.year.wealth },
    { key: "health", group: G2, heading: "🌿 건강·컨디션", body: report.year.health },
    ...opt(report.year.study, { key: "y-study", group: G2, heading: "📚 학업·자기계발", body: report.year.study! }),
    ...opt(report.year.moving, { key: "y-moving", group: G2, heading: "🧳 이동·변화", body: report.year.moving! }),
    ...opt(report.year.family, { key: "y-family", group: G2, heading: "🏡 가족·주변", body: report.year.family! }),
    ...opt(report.wealthDeep, { key: "wealthDeep", group: G2, heading: "💰 재물 심층", body: report.wealthDeep! }),
    ...opt(report.careerDeep, { key: "careerDeep", group: G2, heading: "💼 일·커리어 심층", body: report.careerDeep! }),
    ...opt(report.loveDeep, { key: "loveDeep", group: G2, heading: "💘 연애 심층", body: report.loveDeep! }),
    ...opt(report.healthDeep, { key: "healthDeep", group: G2, heading: "🌿 건강 심층", body: report.healthDeep! }),
    ...opt(report.halves, { key: "half1", group: G2, heading: "🌅 2026 상반기", body: report.halves?.first ?? "" }),
    ...opt(report.halves, { key: "half2", group: G2, heading: "🌇 2026 하반기", body: report.halves?.second ?? "" }),
    ...opt(report.quarters, { key: "q1", group: G2, heading: "🍀 1분기 (1~3월)", body: report.quarters?.q1 ?? "" }),
    ...opt(report.quarters, { key: "q2", group: G2, heading: "☀️ 2분기 (4~6월)", body: report.quarters?.q2 ?? "" }),
    ...opt(report.quarters, { key: "q3", group: G2, heading: "🍁 3분기 (7~9월)", body: report.quarters?.q3 ?? "" }),
    ...opt(report.quarters, { key: "q4", group: G2, heading: "❄️ 4분기 (10~12월)", body: report.quarters?.q4 ?? "" }),
    ...opt(report.turning, { key: "turning", group: G2, heading: "🔀 전환점·변화 포인트", body: report.turning! }),
    ...opt(report.opportunities && report.opportunities.length > 0, {
      key: "opportunities",
      group: G2,
      heading: "🎯 놓치면 아까운 기회",
      body: (report.opportunities ?? []).map((o, i) => `${i + 1}. ${o}`).join("\n\n"),
    }),
    ...opt(report.pitfalls && report.pitfalls.length > 0, {
      key: "pitfalls",
      group: G2,
      heading: "⚠️ 조심할 함정",
      body: (report.pitfalls ?? []).map((o, i) => `${i + 1}. ${o}`).join("\n\n"),
    }),
    ...opt(report.relations2026, { key: "relations2026", group: G2, heading: "🗺️ 2026 인연 지도", body: report.relations2026! }),
    ...opt(report.relationsDeep, { key: "relationsDeep", group: G2, heading: "🧭 관계 지도 확장", body: report.relationsDeep! }),
    ...opt(report.mission, { key: "mission", group: G2, heading: "🎯 올해의 성장 과제", body: report.mission! }),

    // ── 월간 운세 ──
    {
      key: "monthly",
      group: G3,
      heading: "📅 2026 월별 흐름",
      preview: "1월부터 12월까지 달별 흐름",
      children: (
        <div className="flex flex-col">
          {report.monthly.map((m) => (
            <div key={m.month} className="flex gap-2.5 py-2 border-b border-lilac-mid/20 last:border-0">
              <div className="text-[11px] font-bold text-lilac-deep w-7 flex-shrink-0 pt-0.5">{m.month}월</div>
              <MarkdownLite text={m.body} className="text-[12.5px] text-[#4F4A5E] leading-[1.7]" />
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "timing",
      group: G3,
      heading: "⏰ 주목할 시기",
      preview: "흐름 좋은 달과 점검할 달",
      children: (
        <div className="flex flex-col gap-3.5">
          <YearTimeline good={report.timing.good} caution={report.timing.caution} />
          <div className="flex gap-2.5">
            <div className="flex-1 rounded-xl px-3 py-2.5 bg-[#65b28f1a] border border-[#65b28f44]">
              <p className="text-[11px] font-bold text-[#3f8c66] mb-1">흐름 좋은 달</p>
              <p className="text-[14px] font-bold text-[#322E3D]">{report.timing.good}</p>
            </div>
            <div className="flex-1 rounded-xl px-3 py-2.5 bg-[#e0976b1a] border border-[#e0976b44]">
              <p className="text-[11px] font-bold text-[#b5703f] mb-1">점검할 달</p>
              <p className="text-[14px] font-bold text-[#322E3D]">{report.timing.caution}</p>
            </div>
          </div>
        </div>
      ),
    },

    // ── 행운 가이드 ──
    {
      key: "lucky",
      group: G4,
      heading: "🍀 2026 행운 가이드",
      preview: `${report.lucky.color} · ${report.lucky.keyword}`,
      children: (
        <Chips
          items={[
            `🎨 ${report.lucky.color}`,
            `🧭 ${report.lucky.direction}`,
            `🍀 ${report.lucky.months}`,
            `✨ ${report.lucky.keyword}`,
          ]}
        />
      ),
    },
    ...opt(report.remedies, { key: "remedies", group: G4, heading: "🕯️ 2026 개운법", body: report.remedies! }),
    ...opt(report.elementUsage, { key: "elementUsage", group: G4, heading: "🌈 오행 활용법", body: report.elementUsage! }),
    ...opt(report.selfcare, { key: "selfcare", group: G4, heading: "🛁 셀프케어 루틴", body: report.selfcare! }),
    {
      key: "actions",
      group: G4,
      heading: "📌 올해 이것만은 — 실천 3가지",
      preview: report.actions[0],
      children: (
        <ol className="flex flex-col gap-1.5">
          {report.actions.map((a, i) => (
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
      {/* 다크 종합운 히어로 */}
      <div className="rounded-3xl px-5 py-6 text-white" style={{ background: DARK_GRADIENT }}>
        <div className="flex justify-center mb-2">
          <Image src="/byeolkong-joy.png" alt="별콩이" width={60} height={60} className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]" />
        </div>
        <p className="text-[12px] font-bold text-gold/90 text-center">
          2026 종합운 · {report.year2026.hanja}년
        </p>
        <p className="mt-2 font-display text-[19px] font-bold text-center leading-snug">{report.theme}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">🎨 {report.lucky.color}</span>
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">🧭 {report.lucky.direction}</span>
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">🍀 {report.lucky.months}</span>
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">✨ {report.lucky.keyword}</span>
        </div>
        <div className="my-4 h-px bg-white/15" />
        <MarkdownLite text={report.summary} tone="dark" className="text-[13.5px] leading-[1.85] text-white/90" />
      </div>

      {/* 사주판 박스 */}
      <div className="bg-cream-warm rounded-3xl px-3 py-5 border border-lilac-mid/30">
        {saju?.pillars ? (
          <>
            <SajuBoard saju={saju} showDetail={false} />
            <div
              className="mt-4 mx-auto max-w-[300px] rounded-2xl px-4 py-3 text-center text-white"
              style={{ backgroundColor: dayElementColor }}
            >
              <p className="text-[11px] opacity-90">나를 상징하는 일간</p>
              <p className="text-[15px] font-bold mt-0.5">
                {saju.pillars.day.hanja[0]} · {saju.dayStem}({saju.dayElement})
              </p>
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-text-light text-center py-4">
            공유 링크에서는 사주판이 표시되지 않아
          </p>
        )}
      </div>

      {/* 접이식 섹션 (그룹 구분선) */}
      <ReportAccordion items={items} />

      {/* 별콩이의 한마디 — 항상 노출 */}
      <div className="rounded-3xl px-6 py-6 text-white" style={{ background: DARK_GRADIENT }}>
        <div className="flex items-center gap-2 mb-2">
          <Image
            src="/byeolkong-main.png"
            alt="별콩이"
            width={32}
            height={32}
            className="w-8 h-8 rounded-full object-cover border-[1.5px] border-[#4A3D6B] bg-[#3A2F55]"
          />
          <span className="text-[14px] font-bold text-gold">별콩이의 한마디</span>
        </div>
        <MarkdownLite text={report.note} tone="dark" className="text-[13.5px] leading-[1.95] text-white/90" />
      </div>
    </div>
  );
}
