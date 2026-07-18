"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import HeroBanner from "@/components/common/HeroBanner";
import HeroDivider from "@/components/common/HeroDivider";
import { FORTUNE_HERO_GRADIENT } from "@/lib/heroGradients";
import {
  FORTUNE_CONFIG,
  TAROT_POSITIONS,
  type FortuneType,
  type TarotFortuneType,
} from "@/lib/fortune/types";
import type { DrawnCard } from "@/lib/tarot/spreads";

const ACCENT = "#7c5cff";

export default function TarotInput({ type }: { type: FortuneType }) {
  const router = useRouter();
  const cfg = FORTUNE_CONFIG[type];
  const positions = TAROT_POSITIONS[type as TarotFortuneType];

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDrawn, setPendingDrawn] = useState<DrawnCard[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);
  const [effectiveCost, setEffectiveCost] = useState(cfg.cost);

  // 더블탭/연속 클릭으로 인한 중복 POST 차단 — state 는 리렌더 후 반영이라 ref 로 동기 가드.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (type !== "tarot_daily") return;
    void fetch("/api/fortune/tarot-daily-status", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => {
        if (!d) return;
        setFreeRemaining(d.remaining);
        setEffectiveCost(d.remaining > 0 ? 0 : d.nextCost);
      })
      .catch(() => {});
  }, [type]);

  const submit = async (drawn: DrawnCard[]) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/fortune/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, drawnCards: drawn }),
    })
      .then(async (x) => ({
        ok: x.ok,
        status: x.status,
        j: await x.json().catch(() => null),
      }))
      .catch(() => null);
    setSubmitting(false);
    if (!res || !res.ok) {
      inFlightRef.current = false;
      if (res?.j?.code === "INSUFFICIENT_STARS") {
        setError("별이 부족해. 충전소에서 채우고 다시 올래?");
        setShowConfirm(true);
        return;
      }
      setError(
        res?.j?.error === "rate_limited"
          ? "조금만 천천히! 잠시 후 다시 시도해줄래?"
          : "카드를 못 펼쳤어. 잠시 후 다시 시도해줄래?"
      );
      return;
    }
    if (!res.j?.id) {
      inFlightRef.current = false;
      setError("카드를 못 펼쳤어. 잠시 후 다시 시도해줄래?");
      return;
    }
    window.dispatchEvent(new Event("byeolkong:balance-updated"));
    // replace: 카드 선택 화면을 히스토리에서 빼서, 결과/생성중 화면에서 뒤로가면 /fortune 목록으로 간다.
    router.replace(`/fortune/result?id=${res.j.id}`);
  };

  const onComplete = async (drawn: DrawnCard[]) => {
    if (inFlightRef.current) return;
    setError(null);
    const me = await fetch("/api/auth/me", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (!me?.isAuthenticated) {
      window.location.href = "/login?next=" + encodeURIComponent(cfg.href);
      return;
    }
    if (effectiveCost === 0) {
      void submit(drawn);
      return;
    }
    setPendingDrawn(drawn);
    setBalanceLoading(true);
    setBalance(null);
    const bal = await fetch("/api/stars/balance", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setBalanceLoading(false);
    setBalance(typeof bal?.balance === "number" ? bal.balance : 0);
    setShowConfirm(true);
  };

  return (
    <main className="flex flex-1 flex-col items-center pb-6 w-full animate-fade-in">
      <HeroBanner
        image="/byeolkong-main.png"
        gradient={FORTUNE_HERO_GRADIENT}
        title={cfg.label}
        subtitle={cfg.tagline}
        compact
      />

      <HeroDivider />

      {type === "tarot_daily" && freeRemaining !== null && (
        <div className="w-full max-w-md mx-auto px-5 mt-3 mb-1 text-center">
          <p className="text-[11px] text-gold-soft">
            {freeRemaining > 0
              ? `무료 ${freeRemaining}회 남음`
              : `무료 소진 · ⭐${cfg.paidCost}별`}
          </p>
        </div>
      )}

      <CardDrawRitual
        cardCount={positions.length}
        slotLabels={positions}
        accent={ACCENT}
        ritualLabel={cfg.label}
        completeLabel="리포트 받기"
        onComplete={onComplete}
      />

      {error && (
        <p className="text-[12px] text-rose-500 mt-3 px-5 text-center">
          {error}
        </p>
      )}

      {showConfirm && (
        <StarConfirmModal
          cost={effectiveCost}
          balance={balance}
          loading={balanceLoading || submitting}
          accent={ACCENT}
          spreadLabel={cfg.label}
          confirmLabel="확인하고 카드 보기"
          onConfirm={() => {
            if (pendingDrawn) void submit(pendingDrawn);
          }}
          onCharge={() => router.push("/shop")}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </main>
  );
}
