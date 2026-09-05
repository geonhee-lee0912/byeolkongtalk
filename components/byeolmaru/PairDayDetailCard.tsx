"use client";

import type { PairDayCell, PairBackdrop, PairTone } from "@/lib/byeolmaru/pair-day";

// dayGrade(day-score.ts)의 라벨 규칙과 동일 문구 — 우리 점수도 같은 3단 톤(good/normal/caution)
// 위에 서 있으니 "좋다/나쁘다" 단정이 아니라 결의 이름으로 맞춘다(페르소나 화법).
export const PAIR_TONE_LABEL: Record<PairTone, string> = {
  good: "잘 맞는 날",
  normal: "무난한 날",
  caution: "살짝 챙길 날",
};

export default function PairDayDetailCard({
  cell,
  backdrop,
  partnerName,
}: {
  cell: PairDayCell;
  backdrop: PairBackdrop;
  partnerName: string;
}) {
  const md = `${Number(cell.date.slice(5, 7))}월 ${Number(cell.date.slice(8, 10))}일`;
  const tags: string[] = [];
  if (cell.tags.spark) tags.push("끌림↑");
  if (cell.tags.bond) tags.push("결속");
  if (cell.tags.friction) tags.push("삐걱 주의");
  if (cell.tags.lead === "me") tags.push("네가 리드");
  else if (cell.tags.lead === "partner") tags.push(`${partnerName}가 리드`);

  return (
    // DayDetailCard 와 동일하게 aria-live — 그리드에서 다른 날짜/상대를 고르면 이 카드만
    // 갱신되고 포커스는 그리드 버튼에 남는다.
    <section className="rounded-2xl bg-cream-warm p-4" aria-live="polite">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg text-eye-purple">
          {partnerName}와 나 · {cell.isToday ? "오늘" : md}
        </h2>
        <span className="text-sm text-text-light">{cell.ganji}</span>
      </header>

      <p className="mb-3 font-display text-2xl text-eye-purple">{PAIR_TONE_LABEL[cell.tone]}</p>

      {tags.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t} className="rounded-full border border-lilac-mid px-3 py-1 text-xs text-eye-purple">
              {t}
            </li>
          ))}
        </ul>
      )}

      {/* "너희 결" — 고정 궁합 배경(날짜 무관). ③-b 에서 이 <div> 아래에 별콩 LLM 서술이 붙는다. */}
      <div className="border-t border-lilac-soft pt-3 text-xs text-text-light">
        <p className="mb-1">너희 결</p>
        <p className="text-eye-purple">
          {backdrop.labelAtoB} ↔ {backdrop.labelBtoA}
        </p>
        <p className="mt-1">
          {backdrop.spark && "끌림 있음 · "}
          {backdrop.bond && "결속 있음 · "}
          연월조화 {backdrop.harmony}
        </p>
      </div>
    </section>
  );
}
