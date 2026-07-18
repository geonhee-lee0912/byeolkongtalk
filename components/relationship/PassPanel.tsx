"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  PASS_PLANS,
  type PassKind,
} from "@/lib/relationship/types";

interface PassPanelProps {
  relationshipId: string;
  /** 보유 별 — 넘겨주면 상단에 표기(선택). 없으면 표기 생략. */
  balance?: number;
  onPurchased: () => void;
}

export default function PassPanel({
  relationshipId,
  balance,
  onPurchased,
}: PassPanelProps) {
  const router = useRouter();
  const [loadingKind, setLoadingKind] = useState<PassKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async (kind: PassKind) => {
    if (loadingKind) return;
    setLoadingKind(kind);
    setError(null);
    try {
      const res = await fetch("/api/relationship/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId, kind }),
      });
      if (res.status === 402) {
        router.push("/shop");
        return;
      }
      if (!res.ok) {
        setError("구매가 안 됐어. 잠시 후 다시 시도해줄래?");
        return;
      }
      onPurchased();
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    } finally {
      setLoadingKind(null);
    }
  };

  return (
    <div className="rounded-2xl border border-lilac-mid/30 bg-white/90 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13.5px] font-bold text-eye-purple">패스 선택하기</p>
        {typeof balance === "number" && (
          <span className="text-[11.5px] text-text-light">
            ⭐ 보유 {balance}별
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {PASS_PLANS.map((p) => {
          const isLoading = loadingKind === p.kind;
          return (
            <button
              key={p.kind}
              type="button"
              onClick={() => void handleBuy(p.kind)}
              disabled={loadingKind !== null}
              className={`flex items-center justify-between rounded-2xl px-4 py-3 border text-left transition ${
                isLoading
                  ? "border-gold/50 bg-gold-soft/10 opacity-70"
                  : "border-lilac-mid/30 bg-white hover:border-lilac-deep/60 hover:bg-lilac-soft/20 active:scale-[0.98]"
              } disabled:cursor-not-allowed`}
            >
              <span className="text-[14px] font-bold text-eye-purple">
                {isLoading ? "구매하는 중…" : p.label}
              </span>
              <span className="text-[14px] font-bold text-lilac-deep">
                ⭐ {p.cost}별
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gold/50 bg-gold-soft/20 p-3">
        <p className="text-[11.5px] text-eye-purple leading-relaxed">
          패스가 있는 동안 하루 최대 <b>{DAILY_TURN_CAP}번</b> 대화 · 다 쓰면{" "}
          <b>{EXTEND_COST}별</b>마다 <b>{EXTEND_TURNS}번</b>씩 횟수 제한 없이
          연장 · 매일 자정 초기화
        </p>
      </div>

      {error && (
        <p className="mt-3 text-[12px] text-red-500 text-center">{error}</p>
      )}
    </div>
  );
}
