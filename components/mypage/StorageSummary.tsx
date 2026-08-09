// components/mypage/StorageSummary.tsx — 마이 "내 보관함" 종목별 요약 2×2 그리드.
// 탭 → /readings?tab=<종목> (해당 칩 선택된 채 보관함 진입).
import Link from "next/link";
import type { ReadingCategory } from "@/lib/readings/category";

export interface StorageSummaryProps {
  counts: Record<ReadingCategory, number>;
}

const ITEMS: { key: ReadingCategory; icon: string; label: string }[] = [
  { key: "tarot", icon: "🔮", label: "타로" },
  { key: "fortune", icon: "📜", label: "사주·운세" },
  { key: "sim", icon: "🎭", label: "시뮬" },
  { key: "relationship", icon: "💬", label: "우리 사이" },
];

export default function StorageSummary({ counts }: StorageSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          href={`/readings?tab=${item.key}`}
          className="flex items-center gap-2.5 p-3.5 bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)]"
        >
          <span
            className="shrink-0 w-[30px] h-[30px] rounded-[9px] bg-lilac-soft flex items-center justify-center text-[15px]"
            aria-hidden
          >
            {item.icon}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] text-eye-purple font-medium truncate">
              {item.label}
            </span>
            <span className="block text-[16px] text-eye-purple font-bold leading-tight">
              {counts[item.key]}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
