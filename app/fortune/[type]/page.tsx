"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import FortuneSajuPicker from "@/components/fortune/FortuneSajuPicker";
import FortuneGeneratingScreen from "@/components/fortune/FortuneGeneratingScreen";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import FortuneRefundModal from "@/components/fortune/FortuneRefundModal";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { setPendingFortune, clearPendingFortune } from "@/lib/fortune/pending";

export default function FortuneInputPage() {
  const router = useRouter();
  const params = useParams<{ type: string }>();
  const type = params.type as FortuneType;
  const cfg = type in FORTUNE_CONFIG ? FORTUNE_CONFIG[type] : null;

  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCharge, setNeedCharge] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const [reviewable, setReviewable] = useState<Record<string, string>>({});

  // daily 는 전용 페이지, tarot/비활성은 동적 입력 대상 아님
  const valid = !!cfg && cfg.active && cfg.base === "saju" && cfg.type !== "daily";

  useEffect(() => {
    if (!valid) router.replace("/fortune");
  }, [valid, router]);

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

  if (!cfg || !valid) return null;

  // 별 차감 팝업 오픈 — 로그인 확인 후 잔액 조회
  const openConfirm = async (profileId: string) => {
    setError(null);
    setNeedCharge(false);

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
  const handleGenerate = async () => {
    if (!pendingProfileId) return;
    setPendingProfileId(null);
    setGenerating(true);
    setError(null);
    setNeedCharge(false);

    // 이탈 복구 마커 — 생성 직전 기록, 응답 받으면 삭제
    setPendingFortune(cfg.type);

    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: cfg.type, profileId: pendingProfileId }),
      });
      if (!res.ok) {
        clearPendingFortune();
        const data = await res.json().catch(() => ({}));
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
      clearPendingFortune();
      router.push(`/fortune/result?id=${data.id}`);
    } catch {
      clearPendingFortune();
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setGenerating(false);
    }
  };

  if (generating) {
    return <FortuneGeneratingScreen label={cfg.label} emoji={cfg.emoji} type={cfg.type} />;
  }

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        <div className="relative">
          <Image src="/byeolkong-main.png" alt="별콩이" width={120} height={120} priority />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-eye-purple text-center">
          {cfg.label}
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          {cfg.tagline}
        </p>
        <span className="mt-3 text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2.5 py-1 rounded-full">
          ⭐ {cfg.cost}
        </span>
      </div>

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
            <Link href="/shop" className="mt-1 inline-block text-[12px] text-lilac-deep underline">
              별콩 상점 가기
            </Link>
          )}
        </div>
      )}

      <div className="w-full max-w-md mx-auto px-5 mt-3">
        <Link
          href="/fortune"
          className="block w-full py-3.5 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[14px] text-center hover:bg-lilac-deep/5 active:scale-[0.98] transition"
        >
          다른 운세 보기
        </Link>
      </div>

      {pendingProfileId && (
        <StarConfirmModal
          cost={cfg.cost}
          balance={balance}
          loading={balanceLoading}
          accent="#9F8AD0"
          title={`별 ${cfg.cost}개로 ${cfg.label} 볼까?`}
          subtitle={`${cfg.label} 리포트가 바로 만들어져`}
          confirmLabel="확인하고 운세 보기"
          onConfirm={handleGenerate}
          onCharge={() => router.push("/shop")}
          onClose={() => setPendingProfileId(null)}
        />
      )}

      {refunded && (
        <FortuneRefundModal cost={cfg.cost} label={cfg.label} onClose={() => setRefunded(false)} />
      )}
    </main>
  );
}
