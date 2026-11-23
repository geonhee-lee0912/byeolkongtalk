import { MULTI_ROW_SLOT_LAYOUTS } from "@/lib/tarot/slot-layout";
import type { SpreadType } from "@/lib/tarot/spreads";

// 스프레드 안내의 배열 그림 — 카드 뽑기와 같은 배치에 번호·자리 이름까지(디자인 다듬기 묶음 9 ④ S1, 운영자 11-22).
// 자리 이름이 그림에 있으므로 글 쪽에 목록을 또 두지 않는다.
export default function SpreadDiagram({ type, labels }: { type: SpreadType; labels: string[] }) {
  const slot = (i: number) => (
    <div key={i} className="flex w-[84px] flex-col items-center gap-1.5">
      <span className="flex h-[66px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-gold bg-night ring-1 ring-white text-15 font-bold text-gold">
        {i + 1}
      </span>
      <span className="text-center text-12 leading-4 font-bold text-eye-purple break-keep">{labels[i]}</span>
    </div>
  );
  const row = (slots: number[]) => (
    <div key={slots[0]} className="flex items-start justify-center gap-2">
      {slots.map(slot)}
    </div>
  );

  return (
    <div className="mt-5 mb-6 flex flex-col gap-3.5 rounded-2xl bg-lilac-soft px-1.5 py-[18px]">
      {type === "relationship_5" ? (
        // 카드 뽑기와 같게 왼쪽 2×2 + 오른쪽 가운데 5번
        <div className="flex items-center justify-center gap-3">
          <div className="flex flex-col gap-3.5">
            {row([0, 1])}
            {row([2, 3])}
          </div>
          {slot(4)}
        </div>
      ) : (
        (MULTI_ROW_SLOT_LAYOUTS[labels.length] ?? [labels.map((_, i) => i)]).map(row)
      )}
    </div>
  );
}
