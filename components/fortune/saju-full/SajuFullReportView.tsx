"use client";

import { useState } from "react";
import SajuBoard from "@/components/saju/SajuBoard";
import { ELEMENT_COLOR } from "@/lib/fortune/element";
import type { SajuFullReport } from "@/lib/fortune/saju-full-report";
import type { SajuResult } from "@/lib/saju/calc";

type TabKey = "self" | "year" | "monthly" | "lucky";

const TABS: { key: TabKey; label: string }[] = [
  { key: "self", label: "나라는 사람" },
  { key: "year", label: "2026년 총운" },
  { key: "monthly", label: "월간 운세" },
  { key: "lucky", label: "행운 가이드" },
];

const DARK_GRADIENT = "linear-gradient(140deg, #2A1F4D, #1F1735)";

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
      <h3 className="text-[14px] font-bold text-lilac-deep mb-1.5">{title}</h3>
      <p className="text-[13.5px] text-[#322E3D] leading-[1.85] whitespace-pre-line">{body}</p>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5">
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

export default function SajuFullReportView({
  report,
  saju,
}: {
  report: SajuFullReport;
  saju: SajuResult | null;
}) {
  const [tab, setTab] = useState<TabKey>("self");
  const dayElementColor =
    saju ? ELEMENT_COLOR[saju.dayElement] : ELEMENT_COLOR["화"];

  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-4">
      {/* 다크 종합운 카드 */}
      <div
        className="rounded-3xl px-5 py-6 text-white"
        style={{ background: DARK_GRADIENT }}
      >
        <p className="text-[12px] font-bold text-gold/90 text-center">
          2026 종합운 · {report.year2026.hanja}년
        </p>
        <p className="mt-2 font-display text-[19px] font-bold text-center leading-snug">
          {report.theme}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">
            🎨 {report.lucky.color}
          </span>
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">
            🧭 {report.lucky.direction}
          </span>
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">
            🍀 {report.lucky.months}
          </span>
          <span className="bg-white/12 rounded-full px-2.5 py-1 text-[11px] font-bold">
            ✨ {report.lucky.keyword}
          </span>
        </div>
        <div className="my-4 h-px bg-white/15" />
        <p className="text-[13.5px] leading-[1.85] text-white/90 whitespace-pre-line">
          {report.summary}
        </p>
      </div>

      {/* 사주판 박스 */}
      <div className="bg-cream-warm rounded-3xl px-3 py-5 border border-lilac-mid/30">
        {saju ? (
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

      {/* 서브탭 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3.5 py-2 rounded-full text-[12.5px] font-bold border transition ${
              tab === t.key
                ? "bg-lilac-deep text-white border-lilac-deep"
                : "bg-white text-lilac-deep border-lilac-mid/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 나라는 사람 */}
      {tab === "self" && (
        <div className="flex flex-col gap-2.5">
          <Card title="🌱 타고난 기질·성격" body={report.self.nature} />
          <Card title="💎 나의 강점·빛나는 재능" body={report.self.strength} />
          <Card title="🌿 조심할 성향·보완점" body={report.self.caution} />
          <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
            <h3 className="text-[14px] font-bold text-lilac-deep mb-1.5">
              ⚖️ 오행 밸런스 진단
            </h3>
            <p className="text-[13.5px] text-[#322E3D] leading-[1.85] whitespace-pre-line">
              {report.self.balance.lack}
            </p>
            <Chips items={report.self.balance.supplements} />
          </div>
          <Card title="🧭 타고난 적성·어울리는 일" body={report.self.aptitude} />
        </div>
      )}

      {/* 2026년 총운 */}
      {tab === "year" && (
        <div className="flex flex-col gap-2.5">
          <Card title="🌊 2026년 큰 흐름·테마" body={report.year.flow} />
          <Card title="💗 마음·감정 흐름" body={report.year.mind} />
          <Card title="💘 사랑·인연" body={report.year.love} />
          <Card title="🤝 인간관계·사회" body={report.year.relationship} />
          <Card title="💼 일·커리어" body={report.year.career} />
          <Card title="💰 재물·금전" body={report.year.wealth} />
          <Card title="🌿 건강·컨디션" body={report.year.health} />
        </div>
      )}

      {/* 월간 운세 */}
      {tab === "monthly" && (
        <div className="flex flex-col gap-2.5">
          <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
            <h3 className="text-[14px] font-bold text-lilac-deep mb-2.5">
              📅 2026 월별 흐름
            </h3>
            <div className="flex flex-col">
              {report.monthly.map((m) => (
                <div
                  key={m.month}
                  className="flex gap-2.5 py-2 border-b border-lilac-mid/20 last:border-0"
                >
                  <div className="text-[11px] font-bold text-lilac-deep w-7 flex-shrink-0 pt-0.5">
                    {m.month}월
                  </div>
                  <div className="text-[12.5px] text-[#322E3D] leading-[1.7] whitespace-pre-line">
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
            <h3 className="text-[14px] font-bold text-lilac-deep mb-2.5">⏰ 주목할 시기</h3>
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
        </div>
      )}

      {/* 행운 가이드 */}
      {tab === "lucky" && (
        <div className="flex flex-col gap-2.5">
          <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
            <h3 className="text-[14px] font-bold text-lilac-deep mb-1">
              🍀 2026 행운 가이드
            </h3>
            <Chips
              items={[
                `🎨 ${report.lucky.color}`,
                `🧭 ${report.lucky.direction}`,
                `🍀 ${report.lucky.months}`,
                `✨ ${report.lucky.keyword}`,
              ]}
            />
          </div>
          <div className="bg-cream-warm rounded-2xl px-4 py-3.5 border border-lilac-mid/30">
            <h3 className="text-[14px] font-bold text-lilac-deep mb-2">
              📌 올해 이것만은 — 실천 3가지
            </h3>
            <ol className="flex flex-col gap-1.5">
              {report.actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] text-[#322E3D] leading-[1.7]">
                  <span className="font-bold text-lilac-deep flex-shrink-0">{i + 1}.</span>
                  <span>{a}</span>
                </li>
              ))}
            </ol>
          </div>
          <div
            className="rounded-2xl px-5 py-5 text-white"
            style={{ background: DARK_GRADIENT }}
          >
            <h3 className="text-[14px] font-bold text-gold mb-2">🌙 별콩이의 한마디</h3>
            <p className="text-[13.5px] leading-[1.9] text-white/90 whitespace-pre-line">
              {report.note}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
