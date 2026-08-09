// components/mypage/StorageSummary.tsx — 마이 "보관함" 종목별 요약을 한 박스 가로 4분할로.
// 각 칸 탭 → /readings?tab=<종목>. 시안 3: [아이콘 + 개수] 한 줄, 라벨 아래.
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
    <div className="flex bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] px-1 py-3">
      {ITEMS.map((item, i) => (
        <Link
          key={item.key}
          href={`/readings?tab=${item.key}`}
          className={`flex-1 flex flex-col items-center text-center px-1 ${
            i > 0 ? "border-l border-lilac-mid/15" : ""
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <span className="text-[15px]" aria-hidden>
              {item.icon}
            </span>
            <span className="text-[18px] font-bold text-eye-purple leading-none">
              {counts[item.key]}
            </span>
          </span>
          <span className="mt-1.5 text-[10.5px] text-text-light font-medium whitespace-nowrap">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
