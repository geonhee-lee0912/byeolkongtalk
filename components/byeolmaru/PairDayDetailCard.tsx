"use client";

import Image from "next/image";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { PAIR_TONE_LABEL, pairMarks } from "@/lib/byeolmaru/pair-day";
import type { PairTaste } from "@/lib/byeolmaru/static-lines";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";

export default function PairDayDetailCard({
  cell,
  backdrop,
  partnerName,
  entitled,
  taste,
  narrative,
  narrativeLoading,
}: {
  cell: PairDayCell;
  backdrop: PairBackdrop;
  partnerName: string;
  entitled?: boolean;
  /** 비자격자용 무료 taste(~350자, 룰 100%). 자격자는 null — 아래 narrative 가 그 자리를 받는다. */
  taste?: PairTaste | null;
  narrative?: string | null;
  narrativeLoading?: boolean;
}) {
  const md = `${Number(cell.date.slice(5, 7))}월 ${Number(cell.date.slice(8, 10))}일`;
  // 칩은 셀 마크와 같은 어휘·같은 글리프를 쓴다(P5-5) — 달력에서 본 ✧ 가 여기서 "끌림"으로 풀린다.
  const marks = pairMarks(cell.tags);
  // 리드는 마크가 아니라 별도 칩(두 사람 점수 비교라 "그날의 원인"이 아니다).
  // 🔴 `${partnerName}가` 는 받침 있는 이름에서 틀린다("지민가") — 무조사 표기로 고정한다
  //    (narrative-prompt.ts 의 formatPairGoodDay 와 같은 표기).
  const leadChip = cell.tags.lead === "me" ? "네가 리드" : cell.tags.lead === "partner" ? `${partnerName} 리드` : null;

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
            {/* 🔴 `{partnerName}와 나` 는 받침에서 틀린다("지민와") — 어순을 뒤집어 조사를 '나'에 붙인다. */}
            나와 {partnerName} · {cell.isToday ? "오늘" : md}
          </h2>
          <span className="text-sm text-text-light">{cell.ganji}</span>
        </div>
      </header>

      <p className="mb-3 font-display text-2xl text-eye-purple">{PAIR_TONE_LABEL[cell.tone]}</p>

      {(marks.length > 0 || leadChip) && (
        <ul className="mb-4 flex flex-wrap gap-2">
          {marks.map((m) => (
            <li key={m.glyph} className="rounded-full border border-lilac-mid px-3 py-1 text-xs text-eye-purple">
              <span aria-hidden>{m.glyph}</span> {m.label}
            </li>
          ))}
          {leadChip && (
            <li className="rounded-full border border-lilac-mid px-3 py-1 text-xs text-eye-purple">{leadChip}</li>
          )}
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
        // 무료 ~350자(스펙 §8) — 나 탭 DayDetailCard 의 taste 블록과 같은 골격이라 두 탭이 같은
        // 리듬으로 읽힌다. CTA·미끼는 이 카드 밖 PremiumBlock(slot="woori_30d")이 받는다.
        taste ? (
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-eye-purple">
            <p>{taste.signal}</p>
            <p>{taste.relation}</p>
            <p>{taste.lead}</p>
            <p className="text-text-light">{taste.advice}</p>
          </div>
        ) : null
      ) : narrativeLoading ? (
        <p className="mt-3 text-sm text-text-light">별콩이가 둘 사이 오늘을 읽고 있어…</p>
      ) : narrative ? (
        <div className="mt-3 space-y-2">
          {/* pair-narrative 라우트는 date 파라미터가 없어 이 서술은 항상 '오늘' 기준이다 — 다른 날을
              보고 있을 땐 이 글이 그 날이 아니라 오늘 얘기라는 걸 조용히 밝힌다. */}
          {!cell.isToday && <p className="text-xs text-text-light">오늘 기준으로 들려주는 이야기야</p>}
          <p className="whitespace-pre-line text-sm leading-relaxed text-eye-purple">{narrative}</p>
        </div>
      ) : null}
    </section>
  );
}
