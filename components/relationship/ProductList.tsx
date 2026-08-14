"use client";

import { simCount } from "@/lib/relationship/sim";

// components/relationship/ProductList.tsx — 선택한 상대에게 돌릴 상품 목록.
// 💬 연애 상담 · 🎭 연애 시뮬레이션. 둘 다 활성. 카드는 fortune 상품카드 패턴 + 해시태그.
// 회수 표기: 제목 옆 인라인 + (시뮬) 도트로 남은 무료 판 시각화. 스킬 4종은 스레드 안 ⚡도구라 여기 없음.
export interface ProductListProps {
  onOpenThread: () => void;
  onOpenSim: () => void;
  /** 선택 상대의 다음 시뮬 판 자금원(허브가 /sim/quote 로 공급). null=로딩/미선택. */
  simQuote: { funding: "runway" | "hook" | "paid"; cost: number; runwayRemaining: number } | null;
}

const GOLD = "#B07E1C"; // 흰 배경 위 회수 라벨용 진한 금색(연금색 gold 는 대비 부족)

export default function ProductList({ onOpenThread, onOpenSim, simQuote }: ProductListProps) {
  const count = simCount(simQuote);
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
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[15px] font-bold text-eye-purple">연애 상담</span>
            <span className="text-[11px] font-bold" style={{ color: GOLD }}>무료 3턴</span>
          </div>
          <p className="text-[12.5px] text-text-light/80 mt-1 leading-relaxed">
            별콩이가 너의 연애 이야기를 다 기억해 줄게!
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
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[15px] font-bold text-eye-purple">연애 시뮬레이션</span>
            {count && (
              <span className="text-[11px] font-bold" style={{ color: GOLD }}>{count.label}</span>
            )}
          </div>
          {count && count.total > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {Array.from({ length: count.total }).map((_, i) => (
                <span
                  key={i}
                  className={`w-[7px] h-[7px] rounded-full ${i < count.filled ? "bg-gold" : "bg-lilac-soft"}`}
                />
              ))}
              {count.note && <span className="text-[11px] text-text-light/70 ml-1">{count.note}</span>}
            </div>
          )}
          <p className="text-[12.5px] text-text-light/80 mt-1 leading-relaxed">
            그 사람과의 여러 가지 상황을 연습해 봐. 이야기할수록 그 사람과 비슷하게 시뮬레이션할 수 있어!
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
        </div>
      </button>
    </div>
  );
}
