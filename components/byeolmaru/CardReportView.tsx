// components/byeolmaru/CardReportView.tsx — 오늘 타로 유료 7블록 리포트 + 게이지(P6-2 스펙 §6-2·§6-3).
// 게이지: 연보라 = 오늘 사주 축(DayDetailCard 와 같은 값·같은 색·같은 폭 — base 는 항상 그대로 그린다,
// 두 화면이 항상 일치) · 금색 = 이 카드가 더한 것(정위=덧칠) · 뺀 것(역위=금색 빗금, base 채움 위에 얹는다).
// 값은 전부 룰(card-gauge.ts) — 여기선 gaugeSpan 이 준 좌표를 그리기만 한다.
import Image from "next/image";
import { MarkdownLite } from "@/lib/markdown-lite";
import { CARD_REPORT_BLOCKS, type CardReport } from "@/lib/byeolmaru/card-report";
import { gaugeSpan, type GaugeAxis } from "@/lib/byeolmaru/card-gauge";

const GOLD = "#E8C26A";
const AXES: { key: "love" | "money" | "work"; label: string }[] = [
  { key: "love", label: "연애" },
  { key: "money", label: "돈" },
  { key: "work", label: "일" },
];

function GaugeBar({ label, axis }: { label: string; axis: GaugeAxis }) {
  const { base, final, lo, hi, sign } = gaugeSpan(axis);
  const plus = sign > 0;
  return (
    <li className="flex items-center gap-3">
      <span className="w-8 text-sm text-text-light">{label}</span>
      <div
        role="progressbar"
        aria-valuenow={final}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} — 사주 ${base}, 카드 보정 ${axis.delta >= 0 ? "+" : ""}${axis.delta}`}
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-lilac-soft"
      >
        {/* 사주 축(바탕) — DayDetailCard 와 동일하게 항상 base 그대로(카드가 줄여도 안 줄인다).
            "두 화면이 항상 일치"가 계약이라, 폭을 sign 에 따라 바꾸면 그 계약이 깨진다. */}
        <div className="absolute inset-y-0 left-0 rounded-full bg-lilac-deep" style={{ width: `${base}%` }} />
        {sign !== 0 && (
          // 정위: base→final 구간에 금색을 덧칠(바가 늘어난다) / 역위: final→base 구간(= base 채움의 꼬리)
          // 위에 금색 빗금을 얹는다(바탕은 그대로 두고 "이 만큼을 카드가 가져갔다"만 표시).
          <div
            className="absolute inset-y-0"
            style={{
              left: `${lo}%`,
              width: `${hi - lo}%`,
              background: plus ? GOLD : `repeating-linear-gradient(135deg, ${GOLD} 0 2px, transparent 2px 5px)`,
            }}
          />
        )}
      </div>
      {sign !== 0 ? (
        <span className="w-8 text-right text-[11px] font-bold" style={{ color: GOLD }}>
          {plus ? "+" : "−"}{Math.abs(axis.delta)}
        </span>
      ) : (
        <span className="w-8" aria-hidden />
      )}
    </li>
  );
}

export default function CardReportView({ report }: { report: CardReport }) {
  const bodyBlocks = CARD_REPORT_BLOCKS.filter((b) => b.key !== "note");
  return (
    <div className="mt-3">
      <section aria-label="오늘 흐름 게이지" className="rounded-2xl bg-white/70 p-3">
        <ul className="space-y-2">
          {AXES.map(({ key, label }) => (
            <GaugeBar key={key} label={label} axis={report.gauge[key]} />
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-text-light">
          연보라 = 오늘 사주 흐름 · <span style={{ color: GOLD }}>금색</span> = 이 카드가 {report.reversed ? "살짝 덜어낸" : "살짝 더한"} 것
        </p>
      </section>

      {bodyBlocks.map((meta) => (
        <div key={meta.key} className="pt-[17px] mt-[17px] border-t border-[#F0EEF4]">
          <div className="flex items-center gap-[7px] mb-1.5">
            <span className="text-[13px] opacity-85">{meta.icon}</span>
            <span className="text-[12.5px] font-extrabold text-[#4A4458]">{meta.title}</span>
          </div>
          <MarkdownLite text={report.blocks[meta.key]} className="text-[13px] leading-[1.85] text-[#4F4A5E]" />
        </div>
      ))}

      {/* 별콩이의 한마디 — 다크 카드(DailyReportCard 와 동일 톤) */}
      <div className="mt-[18px] bg-[#211A33] rounded-2xl px-4 pt-4 pb-[17px]">
        <div className="flex items-center gap-[9px] mb-[9px]">
          <Image
            src="/byeolkong-main.png"
            alt="별콩이"
            width={32}
            height={32}
            className="w-8 h-8 rounded-full object-cover border-[1.5px] border-[#4A3D6B] bg-[#3A2F55]"
          />
          <span className="text-[12px] font-extrabold text-[#F5D680]">별콩이의 한마디</span>
        </div>
        <MarkdownLite text={report.blocks.note} tone="dark" className="text-[13px] leading-[1.78] text-[#ECE3FB]" />
      </div>
    </div>
  );
}
