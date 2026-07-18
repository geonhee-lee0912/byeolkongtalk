"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import PassPanel from "./PassPanel";
import { formatPassRemaining } from "@/lib/relationship/passDisplay";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  PASS_PLAN_BY_KIND,
} from "@/lib/relationship/types";

interface PassInfo {
  kind: string;
  expiresAt: string;
}
interface DailyInfo {
  used: number;
  allowance: number;
}

interface PassSheetProps {
  relationshipId: string;
  pass: PassInfo | null;
  daily: DailyInfo | null;
  onClose: () => void;
  onPurchased: () => void;
  onExtended: () => void;
}

export default function PassSheet({
  relationshipId,
  pass,
  daily,
  onClose,
  onPurchased,
  onExtended,
}: PassSheetProps) {
  const router = useRouter();
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const planDays = pass ? PASS_PLAN_BY_KIND[pass.kind as keyof typeof PASS_PLAN_BY_KIND]?.days ?? 0 : 0;
  const remaining =
    pass && planDays
      ? formatPassRemaining(new Date(pass.expiresAt).getTime(), planDays, Date.now())
      : null;
  const todayLeft = daily ? Math.max(0, daily.allowance - daily.used) : null;

  const handleExtend = async () => {
    if (extending) return;
    setExtending(true);
    setExtendError(null);
    try {
      const res = await fetch("/api/relationship/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        if (data?.error === "INSUFFICIENT_STARS") router.push("/shop");
        else setExtendError("패스가 만료됐어 — 다시 등록해줄래?");
        return;
      }
      if (!res.ok) {
        setExtendError("연장이 안 됐어. 잠시 후 다시 시도해줄래?");
        return;
      }
      onExtended();
    } catch {
      setExtendError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    } finally {
      setExtending(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="패스 연장·구매"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] max-h-[85vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="font-display text-[16px] font-bold text-eye-purple">패스 · 오늘 대화</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>

        <div className="px-5">
          {pass && (
            <div className="rounded-2xl border border-lilac-mid/25 bg-white/70 px-4 py-3 mb-3 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-text-light">지금 패스</span>
                <span className="font-bold text-eye-purple">{remaining}</span>
              </div>
              {todayLeft !== null && (
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-text-light">오늘 남은 대화</span>
                  <span className="font-bold text-eye-purple">{todayLeft} / 대략 {DAILY_TURN_CAP}번</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleExtend()}
                disabled={extending}
                className="mt-3 w-full flex items-center justify-between rounded-xl bg-lilac-soft/50 px-3.5 py-2.5 active:scale-[0.99] transition disabled:opacity-60"
              >
                <span className="text-[12.5px] font-bold text-eye-purple">
                  {extending ? "연장하는 중…" : `오늘 ${EXTEND_TURNS}번 더 (제한 없이)`}
                </span>
                <span className="text-[12.5px] font-bold text-lilac-deep">⭐{EXTEND_COST}</span>
              </button>
              {extendError && (
                <p className="mt-1.5 text-[11px] text-red-500">{extendError}</p>
              )}
            </div>
          )}

          <PassPanel relationshipId={relationshipId} onPurchased={onPurchased} />
        </div>
      </div>
    </div>,
    document.body
  );
}
