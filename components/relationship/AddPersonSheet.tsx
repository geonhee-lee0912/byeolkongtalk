"use client";

// components/relationship/AddPersonSheet.tsx — 새 사람 슬롯 구매 시트(P2 파일 허브).
// 슬롯이 필요할 때만 뜬다(무료는 곧장 등록 모달). 목업 p2-slot-flow ②③.
// 별 충분 → [슬롯 열고 추가하기] POST /slot → onPurchased. 부족 → [별 충전하러 가기] onGoShop.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface AddPersonSheetProps {
  /** 새 슬롯 가격(SLOT_COST) — 서버 getSlotInfo 권위 */
  nextCost: number;
  /** 보유 별 */
  balance: number;
  /** 슬롯 구매 성공 — 부모가 등록 모달을 연다 */
  onPurchased: () => void;
  /** 별 부족 — 부모가 /shop 으로 라우팅 */
  onGoShop: () => void;
  onClose: () => void;
}

// 경고 톤(별 부족) — 테마 토큰 밖 색이라 인라인(목업 #C0576B).
const WARN = "#C0576B";

export default function AddPersonSheet({
  nextCost,
  balance,
  onPurchased,
  onGoShop,
  onClose,
}: AddPersonSheetProps) {
  // 표시 잔액 — 402 방어 경로에서 서버가 준 실잔액으로 갱신해 부족 상태로 전환.
  const [bal, setBal] = useState(balance);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !purchasing) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, purchasing]);

  const insufficient = bal < nextCost;

  const handlePurchase = async () => {
    if (purchasing) return;
    setPurchasing(true);
    setError(null);
    try {
      const res = await fetch("/api/relationship/slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        balance?: number;
      };
      if (res.status === 402) {
        // 별 부족 — 실잔액으로 갱신해 부족 상태로 전환(방어적).
        setBal(typeof data.balance === "number" ? data.balance : nextCost - 1);
        return;
      }
      if (!res.ok || !data.success) {
        setError("슬롯을 여는 데 실패했어. 잠시 후 다시 시도해줄래?");
        return;
      }
      onPurchased();
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    } finally {
      setPurchasing(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 backdrop-blur-sm animate-fade-in"
      onClick={() => !purchasing && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="새 사람 추가"
    >
      <div
        className="relative w-full max-w-md mx-auto bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] max-h-[85vh] overflow-y-auto scrollbar-hover pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>
        <button
          onClick={() => !purchasing && onClose()}
          aria-label="닫기"
          className="absolute top-3 right-4 w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
        >
          ✕
        </button>

        <div className="px-5 pt-3 pb-2">
          <div className="text-center text-[30px] leading-none mb-2" aria-hidden>
            🧸✨
          </div>
          <h2 className="font-display text-[16px] font-bold text-eye-purple text-center">
            새로운 사람 만나기
          </h2>
          <p className="text-[11.5px] text-text-light text-center mt-1 mb-4">
            {insufficient
              ? "슬롯을 열려면 별이 조금 부족해"
              : "두 번째부터는 슬롯이 필요해"}
          </p>

          <div className="flex items-center justify-between rounded-xl border border-lilac-mid/25 bg-white/70 px-3.5 py-2.5 mb-2">
            <span className="text-[12.5px] text-text-light">새 사람 슬롯</span>
            <span
              className="text-[12.5px] font-bold"
              style={{ color: insufficient ? WARN : undefined }}
            >
              ⭐{nextCost}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-lilac-mid/25 bg-white/70 px-3.5 py-2.5 mb-4">
            <span className="text-[12.5px] text-text-light">내 별</span>
            <span
              className="text-[12.5px] font-bold text-lilac-deep"
              style={{ color: insufficient ? WARN : undefined }}
            >
              ⭐{bal}
              {insufficient && " (부족)"}
            </span>
          </div>

          {insufficient ? (
            <button
              type="button"
              onClick={onGoShop}
              className="w-full py-3.5 rounded-xl text-white font-bold text-[15px] active:scale-[0.98] transition"
              style={{ background: WARN }}
            >
              별 충전하러 가기 →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handlePurchase()}
              disabled={purchasing}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-60"
            >
              {purchasing ? "슬롯 여는 중…" : "슬롯 열고 추가하기"}
            </button>
          )}

          {!insufficient && (
            <p className="text-center text-[10.5px] font-bold text-lilac-mid mt-2.5">
              열면 바로 이름·관계 입력
            </p>
          )}
          {error && (
            <p className="mt-2 text-[11px] text-red-500 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
