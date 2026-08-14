"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FortuneSajuPicker from "@/components/fortune/FortuneSajuPicker";
import FortuneGeneratingScreen from "@/components/fortune/FortuneGeneratingScreen";
import FortuneReportHeader from "@/components/fortune/FortuneReportHeader";

export default function FortuneDailyPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [birthLine, setBirthLine] = useState<string | null>(null);

  // 더블탭/연속 클릭으로 인한 중복 POST 차단 — state 는 리렌더 후 반영이라 ref 로 동기 가드.
  const inFlightRef = useRef(false);

  useEffect(() => {
    void fetch("/api/fortune/daily-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { todayId: string | null } | null) => {
        // 오늘 이미 본 운세가 있으면 사주 확인 화면 없이 바로 결과로
        if (d?.todayId) {
          router.replace(`/fortune/result?id=${d.todayId}`);
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  // 전면 무료 — 로그인 확인 후 바로 생성.
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

    void runGenerate(profileId);
  };

  const runGenerate = async (profileId: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
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
      <FortuneReportHeader
        title="오늘의 운세"
        subtitle={
          <>
            별콩이가 네 사주로
            <br />
            오늘 하루 흐름을 한 장으로 정리해줄게.
          </>
        }
        dividerStar
      />

      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        {birthLine && (
          <p className="mt-1.5 text-[12px] font-medium text-lilac-deep text-center">
            {birthLine}
          </p>
        )}
        <span className="mt-3 text-[11px] font-bold text-sub-warm bg-gold-soft/30 px-2.5 py-1 rounded-full">
          하루 1회 무료
        </span>
      </div>

      <FortuneSajuPicker
        onConfirm={handleConfirm}
        confirmLabel="오늘의 운세 보기"
        lockPrimary
        showBoardDetail={false}
        hideBirthLine
        onSelectedBirthLine={setBirthLine}
      />

      {error && (
        <p className="mt-4 text-[12px] text-red-500 text-center px-5 max-w-md">{error}</p>
      )}

      <div className="w-full max-w-md mx-auto px-5 mt-3">
        <Link
          href="/fortune"
          className="block w-full py-3.5 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[14px] text-center hover:bg-lilac-deep/5 active:scale-[0.98] transition"
        >
          다른 운세 보기
        </Link>
      </div>
    </main>
  );
}
