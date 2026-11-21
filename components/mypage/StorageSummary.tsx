// components/mypage/StorageSummary.tsx — 마이 "보관함" 종목별 요약을 한 박스 가로 분할로.
// 각 칸 탭 → /readings?tab=<종목>. 시안 3: [아이콘 + 개수] 한 줄, 라벨 아래.
// 시뮬레이션·연애 상담 칸은 우리 사이·연애 시뮬 서비스 종료로 뺐다(2026-11-21).
import Link from "next/link";
import type { ReadingCategory } from "@/lib/readings/category";

export interface StorageSummaryProps {
  counts: Record<ReadingCategory, number>;
}

const ITEMS: { key: ReadingCategory; icon: string; label: string }[] = [
  { key: "tarot", icon: "/icons/fortune/tarot_counsel.webp", label: "타로톡" },
  { key: "fortune", icon: "/icons/fortune/saju_full.webp", label: "사주·운세" },
];

export default function StorageSummary({ counts }: StorageSummaryProps) {
  return (
    <div className="flex bg-white rounded-2xl shadow-card px-1 py-4">
      {ITEMS.map((item, i) => (
        <Link
          key={item.key}
          href={`/readings?tab=${item.key}`}
          className={`flex-1 flex flex-col items-center text-center px-1 ${
            i > 0 ? "border-l border-lilac-mid/15" : ""
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <span className="text-15" aria-hidden>
              <img src={item.icon} alt="" width={22} height={22} className="object-contain" />
            </span>
            <span className="text-20 font-bold text-eye-purple leading-none">
              {counts[item.key]}
            </span>
          </span>
          <span className="mt-2 text-11 text-text-light font-medium whitespace-nowrap">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
