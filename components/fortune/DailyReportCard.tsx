import Image from "next/image";
import {
  DAILY_SECTIONS,
  ELEMENT_COLOR,
  type DailyReport,
} from "@/lib/fortune/daily-report";

export default function DailyReportCard({
  report,
  dateLabel,
}: {
  report: DailyReport;
  dateLabel: string | null;
}) {
  const { iljin } = report;
  const c1 = iljin.hanja[0] ?? iljin.stem;
  const c2 = iljin.hanja[1] ?? iljin.branch;
  const filled = Math.min(5, Math.max(1, report.stars));

  return (
    <div className="w-full max-w-md mx-auto px-5">
      <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
        {/* 상단 바 */}
        <div className="flex items-baseline justify-between mb-5">
          <span className="text-[16px] font-bold text-[#1C1A24]">오늘의 운세</span>
          {dateLabel && (
            <span className="text-[11.5px] font-semibold text-text-light/70">{dateLabel}</span>
          )}
        </div>

        {/* 일진 히어로 — 유일한 큰 컬러 포인트 */}
        <div className="text-center mb-[18px]">
          <div className="text-[52px] font-extrabold text-eye-purple leading-none tracking-[2px]">
            {iljin.hanja}
          </div>
          <div className="mt-[7px] text-[12px] font-semibold text-[#8B84A0]">
            {iljin.stem}
            {iljin.branch} · 오늘 들어온 기운
          </div>
          <div className="mt-[9px] flex gap-[6px] justify-center">
            <span className="text-[10.5px] font-bold text-[#6E6880] inline-flex items-center gap-[3px]">
              <i className="w-[6px] h-[6px] rounded-full inline-block" style={{ background: ELEMENT_COLOR[iljin.stemElement] }} />
              {iljin.stemElement} {c1}
            </span>
            <span className="text-[10.5px] font-bold text-[#6E6880] inline-flex items-center gap-[3px]">
              <i className="w-[6px] h-[6px] rounded-full inline-block" style={{ background: ELEMENT_COLOR[iljin.branchElement] }} />
              {iljin.branchElement} {c2}
            </span>
          </div>
        </div>

        {/* 한 줄 총평 */}
        <p className="text-center text-[14px] font-bold text-[#322E3D] leading-[1.5] mb-[14px] whitespace-pre-line">
          {report.summary}
        </p>

        {/* 종합운 별점 (해시태그 위) */}
        <div className="flex items-center justify-center gap-2 mb-[9px]">
          <span className="text-[11px] font-bold text-text-light/70">오늘 종합운</span>
          <span className="text-[13px] tracking-[2px] text-[#C9C4D6]">
            <b className="text-eye-purple">{"★".repeat(filled)}</b>
            {"☆".repeat(5 - filled)}
          </span>
        </div>

        {/* 칩 3종 */}
        <div className="flex gap-[6px] justify-center flex-wrap mb-1.5">
          <span className="text-[10.5px] text-[#6E6880] border border-lilac-mid/40 rounded-full px-[11px] py-1 font-semibold">
            # {report.lucky.keyword}
          </span>
          <span className="text-[10.5px] text-[#6E6880] border border-lilac-mid/40 rounded-full px-[11px] py-1 font-semibold">
            {report.lucky.color}
          </span>
          <span className="text-[10.5px] text-[#6E6880] border border-lilac-mid/40 rounded-full px-[11px] py-1 font-semibold">
            {report.lucky.time}
          </span>
        </div>

        {/* 도입 — 오늘 들어온 두 글자 */}
        <div className="pt-[17px] mt-[18px] border-t border-lilac-mid/25">
          <div className="text-[12.5px] font-extrabold text-[#4A4458] mb-1.5">오늘 들어온 두 글자</div>
          <p className="text-[13px] leading-[1.85] text-[#4F4A5E] whitespace-pre-line">{report.intro}</p>
        </div>

        {/* 6개 도메인 섹션 */}
        {DAILY_SECTIONS.map((meta) => {
          const sec = report.sections.find((s) => s.key === meta.key);
          if (!sec) return null;
          return (
            <div key={meta.key} className="pt-[17px] mt-[17px] border-t border-[#F0EEF4]">
              <div className="flex items-center gap-[7px] mb-1.5">
                <span className="text-[13px] opacity-85">{meta.icon}</span>
                <span className="text-[12.5px] font-extrabold text-[#4A4458]">{meta.title}</span>
              </div>
              <p className="text-[13px] leading-[1.85] text-[#4F4A5E] whitespace-pre-line">{sec.body}</p>
            </div>
          );
        })}

        {/* 오늘의 균형 */}
        <div className="pt-[17px] mt-[17px] border-t border-[#F0EEF4]">
          <div className="flex items-center gap-[7px] mb-1.5">
            <span className="text-[13px] opacity-85">⚖️</span>
            <span className="text-[12.5px] font-extrabold text-[#4A4458]">오늘의 균형</span>
          </div>
          <div className="flex flex-col gap-[9px]">
            <div className="flex gap-[9px] items-start text-[13px] leading-[1.7] text-[#4F4A5E]">
              <span className="shrink-0 text-[11px] font-extrabold text-[#3F8E5C] mt-0.5">좋아</span>
              <span>{report.balance.good}</span>
            </div>
            <div className="flex gap-[9px] items-start text-[13px] leading-[1.7] text-[#4F4A5E]">
              <span className="shrink-0 text-[11px] font-extrabold text-[#C2723E] mt-0.5">주의</span>
              <span>{report.balance.warn}</span>
            </div>
          </div>
        </div>

        {/* 별콩이의 한마디 — 다크 + 프로필 아이콘 */}
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
          <p className="text-[13px] leading-[1.78] text-[#ECE3FB] whitespace-pre-line">{report.note}</p>
        </div>
      </div>
    </div>
  );
}
