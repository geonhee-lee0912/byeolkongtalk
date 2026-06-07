"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import DualSajuPicker from "@/components/fortune/DualSajuPicker";
import FortuneGeneratingScreen from "@/components/fortune/FortuneGeneratingScreen";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { setPendingFortune, clearPendingFortune } from "@/lib/fortune/pending";

type CompatKind = "compat" | "compat_social";

export default function CompatInput({ type }: { type: CompatKind }) {
  const router = useRouter();
  const cfg = FORTUNE_CONFIG[type];

  const [pending, setPending] = useState<{ a: string; b: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCharge, setNeedCharge] = useState(false);

  // 별 차감 팝업 오픈 — 로그인 확인 후 잔액 조회
  const openConfirm = async (profileA: string, profileB: string) => {
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

    setPending({ a: profileA, b: profileB });
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
    if (!pending) return;
    const { a, b } = pending;
    setPending(null);
    setGenerating(true);
    setError(null);
    setNeedCharge(false);

    // 이탈 복구 마커 — 생성 직전 기록, 응답 받으면 삭제
    setPendingFortune(type);

    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, profileA: a, profileB: b }),
      });
      if (!res.ok) {
        clearPendingFortune();
        const data = await res.json().catch(() => ({}));
        if (data?.code === "INSUFFICIENT_STARS") {
          setError("별이 모자라. 충전소에서 별을 채우고 다시 올래?");
          setNeedCharge(true);
        } else {
          setError(
            data?.error === "rate_limited"
              ? "조금만 천천히! 잠시 후 다시 시도해줄래?"
              : "궁합을 못 펼쳤어. 잠시 후 다시 시도해줄래?"
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
    return <FortuneGeneratingScreen label={cfg.label} emoji={cfg.emoji} />;
  }

  const newPersonRelation = type === "compat_social" ? "friend" : "partner";

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

      <DualSajuPicker
        onConfirm={openConfirm}
        confirmLabel="궁합 보기"
        loading={balanceLoading && pending !== null}
        newPersonRelation={newPersonRelation}
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

      {pending && (
        <StarConfirmModal
          cost={cfg.cost}
          balance={balance}
          loading={balanceLoading}
          accent="#9F8AD0"
          title={`별 ${cfg.cost}개로 ${cfg.label} 볼까?`}
          subtitle={`${cfg.label} 리포트가 바로 만들어져`}
          confirmLabel="확인하고 궁합 보기"
          onConfirm={handleGenerate}
          onCharge={() => router.push("/shop")}
          onClose={() => setPending(null)}
        />
      )}
    </main>
  );
}
