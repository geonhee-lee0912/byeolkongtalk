"use client";

// components/relationship/ProductList.tsx — 선택한 상대에게 돌릴 상품 목록.
// 💬 연애 상담(활성) · 🎭 시뮬레이션(disabled "곧 열려") · ┈ 미래 상품 자리.
// 스킬 4종은 상품이 아니라 연애 상담(스레드) 안의 ⚡도구 → 여기 없음. 스펙 §P2 + 목업 p2-hub-v2.
export interface ProductListProps {
  relationshipId: string;
  /** 스레드에 대화 기록이 있으면 "이어가기", 없으면 "시작하기" */
  hasHistory: boolean;
  onOpenThread: () => void;
}

export default function ProductList({ hasHistory, onOpenThread }: ProductListProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* 💬 연애 상담 — 활성 */}
      <button
        type="button"
        onClick={onOpenThread}
        className="flex items-center gap-2.5 rounded-2xl bg-white border border-lilac-soft px-3 py-3 text-left active:scale-[0.99] transition"
      >
        <span className="text-[20px] shrink-0" aria-hidden>💬</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-extrabold text-eye-purple">연애 상담</span>
          <span className="block text-[10px] text-text-light/80 mt-0.5 truncate">
            별콩이랑 지속 대화 · ⚡걔속마음·싸움판정 등
          </span>
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-lilac-soft text-lilac-deep text-[8.5px] font-extrabold px-2 py-[3px] whitespace-nowrap">
          {hasHistory ? "이어가기 ›" : "시작하기 ›"}
        </span>
      </button>

      {/* 🎭 시뮬레이션 — 곧 열려(비활성) */}
      <div className="flex items-center gap-2.5 rounded-2xl bg-[#F4F3F6] border border-dashed border-[#C7C2D2] px-3 py-3">
        <span className="text-[20px] shrink-0" style={{ filter: "grayscale(.4)" }} aria-hidden>🎭</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-extrabold text-[#a49db4]">시뮬레이션</span>
          <span className="block text-[10px] text-text-light/60 mt-0.5 truncate">
            난감한 상황을 인형과 연습
          </span>
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-lilac-soft text-[#8a7a9a] text-[8.5px] font-extrabold px-2 py-[3px] whitespace-nowrap">
          곧 열려
        </span>
      </div>

      {/* ┈ 미래 상품 자리 */}
      <div className="rounded-2xl border border-dashed border-lilac text-center text-[10px] font-bold text-lilac-mid py-3 px-3">
        ┈ 새 상품이 들어올 자리 (편지 등) ┈
      </div>
    </div>
  );
}
