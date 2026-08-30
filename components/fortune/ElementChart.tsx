import type { SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
import { ELEMENT_COLOR } from "@/lib/fortune/element";

const ORDER: FiveElement[] = ["목", "화", "토", "금", "수"];
const LABEL: Record<FiveElement, string> = { 목: "목(木)", 화: "화(火)", 토: "토(土)", 금: "금(金)", 수: "수(水)" };

// 오행 분포 차트 — 결정론적 saju.elementCount 기반. ElementBalanceView 에서 추출한 재사용 컴포넌트.
// GenericReportView·SajuFullReportView 등 여러 리포트에서 주입해 쓴다.
export default function ElementChart({
  saju,
  className,
}: {
  saju: SajuResult | null;
  className?: string;
}) {
  if (!saju) return null;

  const counts = saju.elementCount ?? { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const total = ORDER.reduce((n, e) => n + (counts[e] ?? 0), 0) || 8;
  const max = Math.max(1, ...ORDER.map((e) => counts[e] ?? 0));

  return (
    <div
      className={`bg-white rounded-3xl border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] px-[22px] py-6${className ? ` ${className}` : ""}`}
    >
      <h3 className="text-[14.5px] font-extrabold text-lilac-deep mb-4">🌈 내 오행 분포</h3>
      <div className="flex flex-col gap-2.5">
        {ORDER.map((e) => {
          const c = counts[e] ?? 0;
          const pct = Math.round((c / total) * 100);
          const isMax = c === max && c > 0;
          const isZero = c === 0;
          return (
            <div key={e} className="flex items-center gap-2.5">
              <span className="w-11 text-[12.5px] font-bold shrink-0" style={{ color: ELEMENT_COLOR[e] }}>
                {LABEL[e]}
              </span>
              <div className="flex-1 h-5 rounded-full bg-[#F0EEF4] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(4, (c / max) * 100)}%`, background: ELEMENT_COLOR[e], opacity: isZero ? 0.15 : 1 }}
                />
              </div>
              <span className="w-14 text-right text-[11.5px] tabular-nums text-text-light shrink-0">
                {c}개 · {pct}%{isMax ? " ★" : ""}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-text-light/70 mt-3 leading-snug">
        여덟 글자(사주) 안 오행의 개수야. 넘치는 기운엔 ★, 0개는 옅게 표시했어.
      </p>
    </div>
  );
}
