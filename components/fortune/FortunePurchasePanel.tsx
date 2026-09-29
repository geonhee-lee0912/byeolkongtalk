"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FortuneSajuPicker from "@/components/fortune/FortuneSajuPicker";
import FortuneGeneratingScreen from "@/components/fortune/FortuneGeneratingScreen";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import FortuneRefundModal from "@/components/fortune/FortuneRefundModal";
import AlreadyOwnedModal from "@/components/fortune/AlreadyOwnedModal";
import RechargeSheet from "@/components/upsell/RechargeSheet";
import { RECHARGE_SOURCE } from "@/lib/analytics/recharge-source";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

export default function FortunePurchasePanel({ type }: { type: FortuneType }) {
  const router = useRouter();
  const cfg = FORTUNE_CONFIG[type];

  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCharge, setNeedCharge] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const [alreadyOwned, setAlreadyOwned] = useState<{ id: string } | null>(null);
  const [reviewable, setReviewable] = useState<Record<string, string>>({});
  const [rechargeSheetOpen, setRechargeSheetOpen] = useState(false);

  // 더블탭/연속 클릭으로 인한 중복 POST 차단 — state 는 리렌더 후 반영이라 ref 로 동기 가드.
  const inFlightRef = useRef(false);
  const lastProfileIdRef = useRef<string | null>(null);

  // monthly: 같은 달에 이미 본 프로필 → 다시보기 대상 조회
  useEffect(() => {
    if (cfg?.type !== "monthly") return;
    void (async () => {
      const r = await fetch("/api/fortune/monthly-existing", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (r?.existing) setReviewable(r.existing);
    })();
  }, [cfg?.type]);

  // 별 차감 팝업 오픈 — 로그인 확인 후 잔액 조회
  const openConfirm = async (profileId: string, displayName: string) => {
    setError(null);
    setNeedCharge(false);
    setPendingName(displayName);

    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      const data = me.ok ? await me.json() : null;
      if (!data?.isAuthenticated) {
        window.location.href = "/login?next=" + encodeURIComponent(cfg.href);
        return;
      }
    } catch {
      window.location.href = "/login?next=" + encodeURIComponent(cfg.href);
      return;
    }

    setPendingProfileId(profileId);
    setBalanceLoading(true);
    setBalance(null);
    try {
      const r = await fetch("/api/stars/balance", { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      setBalance(typeof d?.balance === "number" ? d.balance : 0);
    } catch {
      setBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  };

  // 결제 확인 → 리포트 생성
  const handleGenerate = async (force = false) => {
    const profileId = pendingProfileId ?? lastProfileIdRef.current;
    if (!profileId || inFlightRef.current) return;
    lastProfileIdRef.current = profileId;
    inFlightRef.current = true;
    setPendingProfileId(null);
    setGenerating(true);
    setError(null);
    setNeedCharge(false);

    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: cfg.type, profileId, force }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        inFlightRef.current = false;
        if (data?.code === "INSUFFICIENT_STARS") {
          setError("별이 모자라. 충전소에서 별을 채우고 다시 올래?");
          setNeedCharge(true);
        } else if (data?.refunded) {
          setRefunded(true);
        } else {
          setError(
            data?.error === "rate_limited"
              ? "조금만 천천히! 잠시 후 다시 시도해줄래?"
              : "운세를 못 펼쳤어. 잠시 후 다시 시도해줄래?"
          );
        }
        setGenerating(false);
        return;
      }
      const data = await res.json();
      // 이미 같은 사주로 본 상품 — 과금 없이 선택지 제시(force 아니었을 때만).
      if (data.alreadyOwned && !force) {
        inFlightRef.current = false;
        setGenerating(false);
        setAlreadyOwned({ id: data.id });
        return;
      }
      // 생성 시작 시점에 이미 별이 차감됨 — 헤더 잔액 즉시 갱신
      window.dispatchEvent(new Event("byeolkong:balance-updated"));
      router.push(`/fortune/result?id=${data.id}`);
    } catch {
      inFlightRef.current = false;
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setGenerating(false);
    }
  };

  if (generating) {
    return <FortuneGeneratingScreen label={cfg.label} emoji={cfg.emoji} type={cfg.type} />;
  }

  return (
    <div className="w-full">
      <FortuneSajuPicker
        onConfirm={openConfirm}
        confirmLabel="이 사주로 운세 보기"
        loading={balanceLoading && pendingProfileId !== null}
        showBoardDetail={false}
        reviewableByProfile={cfg.type === "monthly" ? reviewable : undefined}
        onReview={
          cfg.type === "monthly"
            ? (rid) => router.push(`/fortune/result?id=${rid}&from=history`)
            : undefined
        }
      />

      {error && (
        <div className="mt-4 text-center px-5 max-w-md">
          <p className="text-[12px] text-red-500">{error}</p>
          {needCharge && (
            <button
              type="button"
              onClick={() => setRechargeSheetOpen(true)}
              className="mt-1 inline-block text-[12px] text-lilac-deep underline"
            >
              별 충전하기
            </button>
          )}
        </div>
      )}

      {pendingProfileId && (
        <StarConfirmModal
          cost={cfg.cost}
          balance={balance}
          loading={balanceLoading}
          accent="#9F8AD0"
          title={`별 ${cfg.cost}개로 ${cfg.label} 볼까?`}
          subtitle={`${cfg.label} 리포트가 바로 만들어져`}
          confirmLabel="확인하고 운세 보기"
          targetName={pendingName ?? undefined}
          onConfirm={() => handleGenerate(false)}
          onCharge={() => setRechargeSheetOpen(true)}
          onClose={() => setPendingProfileId(null)}
        />
      )}

      <RechargeSheet
        open={rechargeSheetOpen}
        returnTo={cfg.href}
        source={RECHARGE_SOURCE.fortunePurchase}
        onClose={() => setRechargeSheetOpen(false)}
      />

      {refunded && (
        <FortuneRefundModal cost={cfg.cost} label={cfg.label} onClose={() => setRefunded(false)} />
      )}

      {alreadyOwned && (
        <AlreadyOwnedModal
          label={cfg.label}
          cost={cfg.cost}
          onReview={() => {
            router.push(`/fortune/result?id=${alreadyOwned.id}&from=history`);
          }}
          onRegenerate={() => {
            setAlreadyOwned(null);
            void handleGenerate(true);
          }}
          onClose={() => setAlreadyOwned(null)}
        />
      )}
    </div>
  );
}
