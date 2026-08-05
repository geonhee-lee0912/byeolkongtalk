"use client";

// components/relationship/ProductList.tsx — 선택한 상대에게 돌릴 상품 목록.
// 💬 연애 상담(활성) · 🎭 연애 시뮬레이션(비활성). 카드는 fortune 상품카드 패턴 + 해시태그.
// 스킬 4종은 상품이 아니라 연애 상담(스레드) 안의 ⚡도구 → 여기 없음. 스펙 §P2 + 목업 p2-hub-v2.
export interface ProductListProps {
  onOpenThread: () => void;
}

export default function ProductList({ onOpenThread }: ProductListProps) {
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
            {["고민상담", "걔속마음", "싸움판정"].map((h) => (
              <span
                key={h}
                className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
              >
                #{h}
              </span>
            ))}
          </div>
        </div>
      </button>

      {/* 🎭 시뮬레이션 — 곧 열려(비활성) */}
      <div className="w-full rounded-2xl p-4 border flex items-center gap-3.5 bg-white/40 border-lilac-mid/15 opacity-70">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
          style={{ background: "linear-gradient(135deg,#EDEAF2,#DED8E8)", filter: "grayscale(.5)" }}
          aria-hidden
        >
          🎭
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[15px] font-bold text-[#a49db4]">연애 시뮬레이션</span>
          <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
            난감한 상황을 인형과 연습
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {["상황연습", "대화리허설", "보낼말찾기"].map((h) => (
              <span
                key={h}
                className="text-[11px] font-bold text-[#a49db4] bg-lilac-soft/30 px-2 py-0.5 rounded-full"
              >
                #{h}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
