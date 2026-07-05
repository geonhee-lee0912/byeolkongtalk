// 사주 요약 행 — 마이페이지 지인 사주 목록과 동일한 형태 (일간 타일 + 제목 + 캡션).
// 카드/버튼 래퍼는 호출처가 감싼다 (flex items-center gap-3 컨테이너 내부용).

import type { SajuResult } from "@/lib/saju/calc";
import { ELEMENT_COLORS } from "@/lib/saju/elements";

const SIJIN = [
  { name: "자시", range: "23~1" },
  { name: "축시", range: "1~3" },
  { name: "인시", range: "3~5" },
  { name: "묘시", range: "5~7" },
  { name: "진시", range: "7~9" },
  { name: "사시", range: "9~11" },
  { name: "오시", range: "11~13" },
  { name: "미시", range: "13~15" },
  { name: "신시", range: "15~17" },
  { name: "유시", range: "17~19" },
  { name: "술시", range: "19~21" },
  { name: "해시", range: "21~23" },
];

function birthTimeToSijin(t: string | null): string | null {
  if (!t) return null;
  const h = Number(t.slice(0, 2));
  const idx = h === 23 ? 0 : Math.floor((h + 1) / 2) % 12;
  const s = SIJIN[idx];
  return `${s.name} (${s.range}시)`;
}

/** "乙목 일간 · 1995. 03. 15 · 사시 (9~11시)" — 생일 정보 없으면 달력/시간 모름으로 폴백 */
export function sajuCaption(
  saju: SajuResult,
  birth?: { birthDate?: string | null; birthTime?: string | null }
): string {
  const parts = [`${saju.dayStem}${saju.dayElement} 일간`];
  if (birth?.birthDate) {
    parts.push(birth.birthDate.replace(/-/g, ". "));
    parts.push(birthTimeToSijin(birth.birthTime ?? null) ?? "시간 모름");
  } else {
    parts.push(saju.input.inputCalendar === "lunar" ? "음력" : "양력");
    if (!saju.input.hourKnown) parts.push("시간 모름");
  }
  return parts.join(" · ");
}

export interface SajuIdentityRowProps {
  saju: SajuResult;
  title: string;
  badge?: string | null;
  caption: string;
}

export default function SajuIdentityRow({
  saju,
  title,
  badge,
  caption,
}: SajuIdentityRowProps) {
  return (
    <>
      <div
        className="shrink-0 w-11 h-11 rounded-xl border border-lilac-mid/30 flex items-center justify-center"
        style={{
          backgroundColor: ELEMENT_COLORS[saju.dayElement].bg,
          color: ELEMENT_COLORS[saju.dayElement].text,
        }}
      >
        <span className="text-[16px] font-bold leading-none">
          {saju.pillars.day.hanja}
        </span>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-[14px] font-bold text-eye-purple truncate">
          {title}
          {badge && (
            <span className="ml-1.5 text-[10px] font-bold text-text-light/70 bg-lilac-soft/60 rounded-full px-1.5 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[11px] text-text-light/70 mt-0.5 truncate">
          {caption}
        </div>
      </div>
    </>
  );
}
