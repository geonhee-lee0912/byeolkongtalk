"use client";

import { simFreeBadge } from "@/lib/relationship/sim";

// components/relationship/ProductList.tsx — 선택한 상대에게 돌릴 상품 목록.
// 💬 연애 상담 · 🎭 연애 시뮬레이션. 둘 다 활성. 카드는 fortune 상품카드 패턴 + 해시태그.
// 스킬 4종은 상품이 아니라 연애 상담(스레드) 안의 ⚡도구 → 여기 없음. 스펙 §P2 + 목업 p2-hub-v2.
export interface ProductListProps {
  onOpenThread: () => void;
  onOpenSim: () => void;
  /** 선택 상대의 다음 시뮬 판 자금원(허브가 /sim/quote 로 공급). null=로딩/미선택. */
  simQuote: { funding: "runway" | "hook" | "paid"; cost: number; runwayRemaining: number } | null;
}

export default function ProductList({ onOpenThread, onOpenSim, simQuote }: ProductListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* 💬 연애 상담 — 활성 */}
      <button
        type="button"
        onClick={onOpenThread}
        className="w-full rounded-2xl p-4 border flex items-center gap-3.5 transition text-left bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] hover:border-lilac-deep/60 active:scale-[0.99]"
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
          style={{ background: "linear-gradient(135deg,#E8DEF5,#D4C7EE)" }}
          aria-hidden
        >
          💬
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[15px] font-bold text-eye-purple">연애 상담</span>
          <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
            별콩이가 너의 연애를 다 기억해줄게!
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {["고민상담", "걔속마음", "비밀친구"].map((h) => (
              <span
                key={h}
                className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
              >
                #{h}
              </span>
            ))}
          </div>
          <p className="text-[11px] font-bold text-lilac-deep mt-1.5">첫 3턴 무료 · 이후 패스</p>
        </div>
      </button>

      {/* 🎭 연애 시뮬레이션 — 활성 */}
      <button
        type="button"
        onClick={onOpenSim}
        className="w-full rounded-2xl p-4 border flex items-center gap-3.5 transition text-left bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] hover:border-lilac-deep/60 active:scale-[0.99]"
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
          style={{ background: "linear-gradient(135deg,#E8DEF5,#D4C7EE)" }}
          aria-hidden
        >
          🎭
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[15px] font-bold text-eye-purple">연애 시뮬레이션</span>
          <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
            난감한 상황을 인형과 연습
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {["상황연습", "대화리허설", "보낼말찾기"].map((h) => (
              <span
                key={h}
                className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
              >
                #{h}
              </span>
            ))}
          </div>
          {simFreeBadge(simQuote) && (
            <p className="text-[11px] font-bold text-lilac-deep mt-1.5">{simFreeBadge(simQuote)}</p>
          )}
        </div>
      </button>
    </div>
  );
}
