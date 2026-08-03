"use client";

// 사주 운세(2탭) 카테고리 필터 칩. 순수 프레젠테이션 — 상태·계측은 부모(page)가 가진다.
import { FORTUNE_CHIPS, type FortuneCategory } from "@/lib/fortune/types";

interface Props {
  active: FortuneCategory;
  onSelect: (cat: FortuneCategory) => void;
}

export default function CategoryChips({ active, onSelect }: Props) {
  return (
    <div className="w-full max-w-md mx-auto flex gap-2 px-5 py-3 overflow-x-auto">
      {FORTUNE_CHIPS.map((chip) => {
        const on = chip.key === active;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onSelect(chip.key)}
            aria-pressed={on}
            className={
              on
                ? "shrink-0 text-[13px] font-bold px-4 py-1.5 rounded-full bg-eye-purple text-white transition"
                : "shrink-0 text-[13px] font-bold px-4 py-1.5 rounded-full bg-white border border-lilac-soft text-text-light transition"
            }
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
