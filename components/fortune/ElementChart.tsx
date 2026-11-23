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
  const max = Math.max(1, ...ORDER.map((e) => counts[e] ?? 0));

  // 한 줄 띠(디자인 다듬기 묶음 4 결과 O2, 운영자 11-16) — 다섯 색으로 나눈 막대 하나 + 아래 개수.
  // 예전 다섯 줄 막대(개수·%)의 절반 높이. 0개인 기운은 띠에 없고 아래 숫자만 옅게.
  return (
    <div
      className={`card-report${className ? ` ${className}` : ""}`}
    >
      <h3 className="text-14 font-extrabold text-accent mb-3">
        오행 분포 <span className="ml-1 text-12 font-semibold text-text-light">여덟 글자 중</span>
      </h3>
      <div className="flex h-3.5 gap-0.5 rounded-full overflow-hidden">
        {ORDER.filter((e) => (counts[e] ?? 0) > 0).map((e) => (
          <div key={e} style={{ flex: counts[e], background: ELEMENT_COLOR[e] }} />
        ))}
      </div>
      <div className="flex mt-2.5">
        {ORDER.map((e) => {
          const c = counts[e] ?? 0;
          const isMax = c === max && c > 0;
          return (
            <div key={e} className={`flex-1 text-center ${c === 0 ? "opacity-40" : ""}`}>
              <p className="text-12 font-bold" style={{ color: ELEMENT_COLOR[e] }}>
                {LABEL[e]}
              </p>
              <p
                className="text-15 font-extrabold tabular-nums mt-px"
                style={{ color: isMax ? ELEMENT_COLOR[e] : "#5A3E8C" }}
              >
                {c}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
