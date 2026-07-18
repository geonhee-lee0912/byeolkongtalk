"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FortuneSajuPicker from "@/components/fortune/FortuneSajuPicker";
import FortuneGeneratingScreen from "@/components/fortune/FortuneGeneratingScreen";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import HeroBanner from "@/components/common/HeroBanner";
import { FORTUNE_HERO_GRADIENT } from "@/lib/heroGradients";

interface DailyStatus {
  used: number;
  limit: number;
  remaining: number;
  nextCost: number;
  todayId: string | null;
}

export default function FortuneDailyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [birthLine, setBirthLine] = useState<string | null>(null);

  // 더블탭/연속 클릭으로 인한 중복 POST 차단 — state 는 리렌더 후 반영이라 ref 로 동기 가드.
  const inFlightRef = useRef(false);

  useEffect(() => {
    void fetch("/api/fortune/daily-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DailyStatus | null) => {
        // 오늘 이미 본 운세가 있으면 사주 확인 화면 없이 바로 결과로
        if (d?.todayId) {
          router.replace(`/fortune/result?id=${d.todayId}`);
          return;
        }
        if (d) setStatus(d);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  // 무료 잔여면 바로 생성, 소진 후면 별 차감 팝업
  const handleConfirm = async (profileId: string) => {
    if (inFlightRef.current) return;
    setError(null);

    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      const data = me.ok ? await me.json() : null;
      if (!data?.isAuthenticated) {
        window.location.href = "/login?next=" + encodeURIComponent("/fortune/daily");
        return;
      }
    } catch {
      window.location.href = "/login?next=" + encodeURIComponent("/fortune/daily");
      return;
    }

    const paid = !!status && status.remaining <= 0;
    if (!paid) {
      void runGenerate(profileId);
      return;
    }

    // 유료 — 잔액 조회 후 팝업
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

  const runGenerate = async (profileId: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPendingProfileId(null);
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "daily", profileId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        inFlightRef.current = false;
        setError(
          data?.error === "rate_limited"
            ? "조금만 천천히! 잠시 후 다시 시도해줄래?"
            : "운세를 못 펼쳤어. 잠시 후 다시 시도해줄래?"
        );
        setGenerating(false);
        return;
      }
      const data = await res.json();
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
    return <FortuneGeneratingScreen label="오늘의 운세" emoji="🌤️" />;
  }

  if (checking) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">별콩이가 오늘 운세를 확인하는 중…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center pb-10 w-full animate-fade-in">
      <HeroBanner
        image="/byeolkong-main.png"
        gradient={FORTUNE_HERO_GRADIENT}
        title="오늘의 운세"
        subtitle={
          <>
            별콩이가 네 사주로
            <br />
            오늘 하루 흐름을 한 장으로 정리해줄게.
          </>
        }
        compact
      />

      <div className="w-full max-w-md mx-auto px-5 mt-4 mb-6 flex flex-col items-center">
        {birthLine && (
          <p className="mt-1.5 text-[12px] font-medium text-lilac-deep text-center">
            {birthLine}
          </p>
        )}
        {status &&
          (status.remaining > 0 ? (
            <span className="mt-3 text-[11px] font-bold text-sub-warm bg-gold-soft/30 px-2.5 py-1 rounded-full">
              무료 {status.remaining}/{status.limit}회 남음
            </span>
          ) : (
            <span className="mt-3 text-[11px] font-bold text-text-light/70 bg-lilac-soft/50 px-2.5 py-1 rounded-full">
              무료 소진 · 이번부터 ⭐ {status.nextCost}
            </span>
          ))}
      </div>

      <FortuneSajuPicker
        onConfirm={handleConfirm}
        confirmLabel="오늘의 운세 보기"
        loading={balanceLoading}
        lockPrimary
        showBoardDetail={false}
        hideBirthLine
        onSelectedBirthLine={setBirthLine}
      />

      {error && (
        <p className="mt-4 text-[12px] text-red-500 text-center px-5 max-w-md">{error}</p>
      )}

      <Link href="/fortune" className="mt-6 text-[12px] text-text-light/70 underline">
        다른 운세 보기
      </Link>

      {pendingProfileId && status && (
        <StarConfirmModal
          cost={status.nextCost}
          balance={balance}
          loading={balanceLoading}
          accent="#9F8AD0"
          title={`별 ${status.nextCost}개로 오늘의 운세 볼까?`}
          subtitle="무료 횟수를 다 써서 이번엔 별이 필요해"
          confirmLabel="확인하고 운세 보기"
          onConfirm={() => runGenerate(pendingProfileId)}
          onCharge={() => router.push("/shop")}
          onClose={() => setPendingProfileId(null)}
        />
      )}
    </main>
  );
}
