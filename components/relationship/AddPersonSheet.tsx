"use client";

// components/relationship/AddPersonSheet.tsx — 새 사람 슬롯 구매 시트(P2 파일 허브).
// 슬롯이 필요할 때만 뜬다(무료는 곧장 등록 모달). 목업 p2-slot-flow ②③.
// 별 충분 → [슬롯 열고 추가하기] POST /slot → onPurchased. 부족 → [별 충전하러 가기] onGoShop.
import { useState } from "react";
import Sheet from "@/components/common/Sheet";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";
import Icon from "@/components/common/Icon";

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

  // 포털·배경막·ESC·스크롤 잠금은 공통 Sheet(구매 중엔 닫기 불가). 웹 손잡이 줄은 web-only — 앱은 Sheet 손잡이
  return (
    <Sheet
      label="새 사람 추가"
      onClose={onClose}
      dismissible={!purchasing}
      z={90}
      align="bottom"
      backdropClassName="bg-night/50 backdrop-blur-sm"
      panelClassName="bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-float-up max-h-[85vh] overflow-y-auto scrollbar-hover pb-[max(env(safe-area-inset-bottom),16px)]"
    >
        <div className="web-only flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>
        <OverlayCloseButton
          disabled={purchasing}
          aria-label="닫기"
          className="absolute top-3 right-4 w-8 h-8 rounded-full flex items-center justify-center text-text-light hover:bg-lilac-soft/50"
        >
          <Icon name="close" size={18} />
        </OverlayCloseButton>

        <div className="px-5 pt-3 pb-2">
          <div className="text-center text-28 leading-none mb-2" aria-hidden>
            
          </div>
          <h2 className="font-display text-17 font-bold text-eye-purple text-center">
            새로운 사람 만나기
          </h2>
          <p className="text-12 text-text-light text-center mt-1 mb-4">
            {insufficient
              ? "슬롯을 열려면 별이 조금 부족해"
              : "새 사람을 추가하려면 슬롯이 필요해"}
          </p>

          <div className="card-inner flex items-center justify-between mb-2">
            <span className="text-13 text-text-light">새 사람 슬롯</span>
            <span
              className="text-13 font-bold"
              style={{ color: insufficient ? WARN : undefined }}
            >
              <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />{nextCost}
            </span>
          </div>
          <div className="card-inner flex items-center justify-between mb-4">
            <span className="text-13 text-text-light">내 별</span>
            <span
              className="text-13 font-bold text-accent"
              style={{ color: insufficient ? WARN : undefined }}
            >
              <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />{bal}
              {insufficient && " (부족)"}
            </span>
          </div>

          {insufficient ? (
            <button
              type="button"
              onClick={onGoShop}
              className="btn btn-lg text-white"
              style={{ background: WARN }}
            >
              별 충전하러 가기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handlePurchase()}
              disabled={purchasing}
              className="btn btn-primary btn-lg"
            >
              {purchasing ? "슬롯 여는 중…" : "슬롯 열고 추가하기"}
            </button>
          )}

          {!insufficient && (
            <p className="text-center text-11 font-bold text-lilac-mid mt-2.5">
              열면 바로 이름·관계 입력
            </p>
          )}
          {error && (
            <p className="mt-2 text-11 text-red-500 text-center">{error}</p>
          )}
        </div>
    </Sheet>
  );
}
