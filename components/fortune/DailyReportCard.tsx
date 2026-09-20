import type { ReactNode } from "react";
import Image from "next/image";
import {
  DAILY_SECTIONS,
  ELEMENT_COLOR,
  type DailyReport,
} from "@/lib/fortune/daily-report";
import { MarkdownLite } from "@/lib/markdown-lite";

// 바깥 껍데기 — standalone 은 제 몸으로 서는 카드(/fortune/result·어드민)라 가운데 정렬 + 흰 카드를
// 두르지만, embedded 는 이미 DayDetailCard 의 한 장(bg-cream-warm p-4) **안**이다. 거기서 흰 카드를
// 한 겹 더 두르면 카드 위에 카드가 앉고 px-5 가 이중으로 먹는다(§5-1 한 장).
function Shell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  if (embedded) return <>{children}</>;
  return (
    <div className="w-full max-w-md mx-auto px-5">
      <div className="bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6">
        {children}
      </div>
    </div>
  );
}

export default function DailyReportCard({
  report,
  dateLabel,
  dayWord = "오늘",
  variant = "standalone",
}: {
  report: DailyReport;
  dateLabel: string | null;
  /** 그 날을 부르는 말. 오늘이 아닌 날짜의 리포트면 "그날"(lib/byeolmaru/report-date.ts dayWordFor). */
  dayWord?: "오늘" | "그날";
  /** "embedded" 는 별마루 상세의 **한 장 안**에 들어갈 때 — 별콩이 히어로·상단 바·일진 히어로·카드
   *  래퍼를 생략한다(전부 무료 구간이 이미 그렸다, P6-4 §5-1). 기본은 기존 그대로(/fortune·어드민 무회귀). */
  variant?: "standalone" | "embedded";
}) {
  const { iljin } = report;
  const c1 = iljin.hanja[0] ?? iljin.stem;
  const c2 = iljin.hanja[1] ?? iljin.branch;
  const filled = Math.min(5, Math.max(1, report.stars));
  const embedded = variant === "embedded";

  return (
    <Shell embedded={embedded}>
      {/* 🔴 embedded 에선 통째로 빠진다 — 별콩이 히어로·상단 바(날짜)·일진 히어로는 한 장의 **무료
          구간**이 이미 그렸다(일진 히어로는 아예 DayDetailCard 로 올라갔다, §5-1). 두 번 그리면
          한 화면에 같은 간지가 두 번 뜬다. c1·c2 는 여기서만 쓰이므로 embedded 에선 실행되지 않지만
          standalone 이 쓰는 값이라 그대로 둔다. */}
      {!embedded && (
        <>
          <div className="flex justify-center mb-2">
            <div className="relative w-[88px] h-[100px]">
              <Image src="/fortune-hero-daily.webp" alt="별콩이" fill className="object-contain" />
            </div>
          </div>
          {/* 상단 바 */}
          <div className="flex items-baseline justify-between mb-5">
            <span className="text-[16px] font-bold text-[#1C1A24]">{dayWord}의 운세</span>
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
              {iljin.branch} · {dayWord} 들어온 기운
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
        </>
      )}

      {/* 한 줄 총평 */}
      <MarkdownLite
        text={report.summary}
        className="text-center text-[14px] font-bold text-[#322E3D] leading-[1.5] mb-[14px]"
      />

      {/* 종합운 별점 (해시태그 위) */}
      <div className="flex items-center justify-center gap-2 mb-[9px]">
        <span className="text-[11px] font-bold text-text-light/70">{dayWord} 종합운</span>
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
        <div className="text-[12.5px] font-extrabold text-[#4A4458] mb-1.5">{dayWord} 들어온 두 글자</div>
        <MarkdownLite text={report.intro} className="text-[13px] leading-[1.85] text-[#4F4A5E]" />
      </div>

      {/* 5개 도메인 섹션 (DAILY_SECTIONS 가 정본) */}
      {DAILY_SECTIONS.map((meta) => {
        const sec = report.sections.find((s) => s.key === meta.key);
        if (!sec) return null;
        return (
          <div key={meta.key} className="pt-[17px] mt-[17px] border-t border-[#F0EEF4]">
            <div className="flex items-center gap-[7px] mb-1.5">
              <span className="text-[13px] opacity-85">{meta.icon}</span>
              <span className="text-[12.5px] font-extrabold text-[#4A4458]">{meta.title}</span>
            </div>
            <MarkdownLite text={sec.body} className="text-[13px] leading-[1.85] text-[#4F4A5E]" />
          </div>
        );
      })}

      {/* 오늘의 균형 */}
      <div className="pt-[17px] mt-[17px] border-t border-[#F0EEF4]">
        <div className="flex items-center gap-[7px] mb-1.5">
          <span className="text-[13px] opacity-85">⚖️</span>
          <span className="text-[12.5px] font-extrabold text-[#4A4458]">{dayWord}의 균형</span>
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
        <MarkdownLite text={report.note} tone="dark" className="text-[13px] leading-[1.78] text-[#ECE3FB]" />
      </div>
    </Shell>
  );
}
