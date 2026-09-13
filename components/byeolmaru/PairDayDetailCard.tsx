"use client";

import Image from "next/image";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { PAIR_TONE_LABEL } from "@/lib/byeolmaru/pair-day";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";

export default function PairDayDetailCard({
  cell,
  backdrop,
  partnerName,
  entitled,
  staticLine,
  narrative,
  narrativeLoading,
  trialUsed,
  onStartTrial,
  onSubscribe,
}: {
  cell: PairDayCell;
  backdrop: PairBackdrop;
  partnerName: string;
  entitled?: boolean;
  staticLine?: string | null;
  narrative?: string | null;
  narrativeLoading?: boolean;
  trialUsed?: boolean;
  onStartTrial?: () => void;
  onSubscribe?: () => void;
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
      <header className="mb-3 flex items-center gap-3">
        {/* ⑦ 일지 캐릭터 — 그날 지지 동물(우리 상세도 동일). */}
        {(() => {
          const a = branchAnimal(cell.ganji);
          return a ? (
            <Image src={a.assetSrc} alt={a.animal} width={56} height={56} className="h-14 w-14 shrink-0 object-contain" />
          ) : null;
        })()}
        <div className="flex flex-1 items-baseline justify-between">
          <h2 className="font-display text-lg text-eye-purple">
            {partnerName}와 나 · {cell.isToday ? "오늘" : md}
          </h2>
          <span className="text-sm text-text-light">{cell.ganji}</span>
        </div>
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

      {entitled === false ? (
        <>
          {staticLine ? (
            <p className="mt-3 text-sm leading-relaxed text-eye-purple">{staticLine}</p>
          ) : null}
          <p className="mt-3 mb-2 text-sm leading-relaxed text-eye-purple [mask-image:linear-gradient(#000,transparent)] opacity-60">
            별콩이가 둘 사이 오늘을 풀어주고, 이번 달 전체 흐름까지 펼쳐주면…
          </p>
          {!trialUsed ? (
            <button
              onClick={onStartTrial}
              className="w-full rounded-xl bg-gold py-2.5 text-sm font-medium text-eye-purple"
            >
              3일 무료 체험 시작
            </button>
          ) : (
            <button
              onClick={onSubscribe}
              className="w-full rounded-xl bg-gold py-2.5 text-sm font-medium text-eye-purple"
            >
              구독하고 우리 오늘 이번 달 전체 보기
            </button>
          )}
        </>
      ) : narrativeLoading ? (
        <p className="mt-3 text-sm text-text-light">별콩이가 둘 사이 오늘을 읽고 있어…</p>
      ) : narrative ? (
        <div className="mt-3 space-y-2 whitespace-pre-line text-sm leading-relaxed text-eye-purple">{narrative}</div>
      ) : null}
    </section>
  );
}
