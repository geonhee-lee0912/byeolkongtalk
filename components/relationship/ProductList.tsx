"use client";

// components/relationship/ProductList.tsx — 선택한 상대에게 돌릴 상품 목록.
// 💬 연애 상담(활성) · 🎭 시뮬레이션(disabled "곧 열려"). 카드는 fortune 상품카드 패턴.
// 스킬 4종은 상품이 아니라 연애 상담(스레드) 안의 ⚡도구 → 여기 없음. 스펙 §P2 + 목업 p2-hub-v2.
export interface ProductListProps {
  /** 스레드에 대화 기록이 있으면 "이어가기", 없으면 "시작하기" */
  hasHistory: boolean;
  onOpenThread: () => void;
}

export default function ProductList({ hasHistory, onOpenThread }: ProductListProps) {
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
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-eye-purple">연애 상담</span>
            <span className="bg-lilac-soft text-lilac-deep rounded-full px-2 py-0.5 text-[10px] font-bold">
              {hasHistory ? "이어가기" : "시작하기"}
            </span>
          </div>
          <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
            별콩이랑 지속 대화 · ⚡걔속마음·싸움판정 등
          </p>
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
          <span className="text-[15px] font-bold text-[#a49db4]">시뮬레이션</span>
          <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
            난감한 상황을 인형과 연습
          </p>
        </div>
        <span className="text-[10px] text-text-light/50 shrink-0">곧 열려</span>
      </div>
    </div>
  );
}
