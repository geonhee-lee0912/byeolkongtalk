// components/admin/ContributionHero.tsx — 1층 히어로. "지금 장사가 되고 있나" 한 줄.
//
// 스펙 §8: 손익 한 줄은 차트가 아니라 **히어로 숫자**다. 값 하나를 크게 보여주는 게
// 스파크라인보다 정확하다 — 추세는 바로 아래 밴드가 답한다.
import { formatSignedWon, formatMetric } from "@/lib/admin/format";
import { STATUS } from "@/lib/admin/colors";
import type { CostCoverage } from "@/lib/admin/band";

export function ContributionHero({
  revenueWon,
  adSpendWon,
  apiCostWon,
  coverage,
  adStaleDays,
}: {
  revenueWon: number;
  adSpendWon: number;
  apiCostWon: number;
  coverage: CostCoverage;
  /**
   * 🔴 창 끝에서 광고비가 비어 있는 날 수. `ad_spend` 는 **사용자가 손으로 입력**해서
   * 최근 며칠이 늘 비어 있다 — Task 4 실측에서 09-19 까지만 입력돼 **5일 공백**이었다.
   * 7일 창에서 5일이 비면 광고비가 ~71% 과소로 잡히고 **기여가 그만큼 과대**로 보인다.
   * 이 숫자를 화면이 말하지 않으면 레지스트리의 caveat 는 아무도 안 읽는다.
   */
  adStaleDays: number;
}) {
  // 🔴 원가가 창을 다 덮지 못하면 기여에서 **빼지 않는다.** 일부 날만 빼면 그 숫자는 어떤 창의
  //    손익도 아니다. 대신 빠졌다는 사실을 캡션이 말한다(0 으로 위장하지 않는다 — 스펙 §3).
  const contribution = coverage.full
    ? revenueWon - adSpendWon - apiCostWon
    : revenueWon - adSpendWon;
  const negative = contribution < 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-[12px] text-white/60">
        기여 <span className="text-white/35">(최근 7일 · KST 자정 기준)</span>
      </div>
      {/* 🔴 STATUS 를 Tailwind arbitrary-value 클래스에 보간하지 않는다(정적 스캔 불가 — Metric.tsx
          참조). 색만 style 로 바인딩한다. */}
      <div className="text-4xl font-bold mt-1" style={{ color: negative ? STATUS.serious : STATUS.good }}>
        {formatSignedWon(contribution)}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[13px]">
        <span className="text-white/70">
          매출 <span className="text-white">{formatSignedWon(revenueWon)}</span>
        </span>
        <span className="text-white/70">
          광고비 <span className="text-white">{formatSignedWon(-adSpendWon)}</span>
        </span>
        <span className="text-white/70">
          API 원가{" "}
          <span className="text-white">
            {coverage.covered === 0 ? "—" : formatSignedWon(-apiCostWon)}
          </span>
        </span>
      </div>
      {!coverage.full && (
        <div className="text-[11px] text-white/40 mt-2 leading-snug">
          API 원가는 축적 {coverage.covered}/{coverage.total}일 — 창을 다 덮지 못해{" "}
          <b className="text-white/60">기여에서 빠져 있다</b>. 위 값은 매출 − 광고비다.
          {coverage.covered > 0 && ` (덮인 날의 원가 합 ${formatMetric(apiCostWon, "won")})`}
        </div>
      )}
      {/* 🔴 광고비 입력 지연 — 이게 없으면 기여가 조용히 과대로 읽힌다(Task 4 실측: 5일 공백). */}
      {adStaleDays > 0 && (
        <div className="text-[11px] mt-2 leading-snug" style={{ color: STATUS.warning }}>
          광고비가 최근 <b>{adStaleDays}일</b> 비어 있다 — 손으로 입력하는 값이다. 그만큼{" "}
          <b>기여가 과대</b>로 보인다. 입력 후 다시 읽을 것.
        </div>
      )}
      <div className="text-[11px] text-white/35 mt-1.5 leading-snug">
        인프라 비용(Vercel·Supabase)은 빠져 있다 — 월 단위로만 파악된다.
      </div>
    </div>
  );
}
