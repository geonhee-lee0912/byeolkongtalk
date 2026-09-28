// components/byeolmaru/PairReportView.tsx — 우리 오늘 유료 5블록 리포트 렌더러.
// 형제 CardReportView.tsx(오늘 타로 7블록)와 **같은 치수·같은 구분선·같은 note 다크 카드**다 —
// 두 화면이 한 시스템으로 읽혀야 하므로 값을 따로 고르지 말 것(바꾸려면 양쪽을 같이 바꾼다).
// 🔴 게이지는 없다 — 그건 타로 고유 물건이다(카드가 사주 축을 보정하는 폭). 우리 오늘엔 보정할
//    카드가 없고, 관계 점수는 달력 셀·PairDayDetailCard 상단 backdrop 이 이미 말한다.
import Image from "next/image";
import { MarkdownLite } from "@/lib/markdown-lite";
import { PAIR_REPORT_BLOCKS, type PairReport } from "@/lib/byeolmaru/pair-report";

export default function PairReportView({ report }: { report: PairReport }) {
  const bodyBlocks = PAIR_REPORT_BLOCKS.filter((b) => b.key !== "note");
  return (
    <div className="mt-3">
      {bodyBlocks.map((meta) => (
        <div key={meta.key} className="pt-[17px] mt-[17px] border-t border-[#F0EEF4]">
          <div className="mb-1.5 flex items-center gap-[7px]">
            <span className="text-[13px] opacity-85">{meta.icon}</span>
            <span className="text-[12.5px] font-extrabold text-[#4A4458]">{meta.title}</span>
          </div>
          <MarkdownLite text={report.blocks[meta.key]} className="text-[13px] leading-[1.85] text-[#4F4A5E]" />
        </div>
      ))}

      {/* 별콩이의 한마디 — 다크 카드(CardReportView·DailyReportCard 와 동일 톤) */}
      <div className="mt-[18px] rounded-2xl bg-[#211A33] px-4 pt-4 pb-[17px]">
        <div className="mb-[9px] flex items-center gap-[9px]">
          <Image
            src="/byeolkong-main.png"
            alt="별콩이"
            width={32}
            height={32}
            className="h-8 w-8 rounded-full border-[1.5px] border-[#4A3D6B] bg-[#3A2F55] object-cover"
          />
          <span className="text-[12px] font-extrabold text-[#F5D680]">별콩이의 한마디</span>
        </div>
        <MarkdownLite text={report.blocks.note} tone="dark" className="text-[13px] leading-[1.78] text-[#ECE3FB]" />
      </div>
    </div>
  );
}
