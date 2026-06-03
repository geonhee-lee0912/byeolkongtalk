"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SajuInputForm from "@/components/saju/SajuInputForm";
import type { SajuInput } from "@/lib/saju/calc";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

export default function FortuneInputPage() {
  const router = useRouter();
  const params = useParams<{ type: string }>();
  const type = params.type as FortuneType;
  const cfg = type in FORTUNE_CONFIG ? FORTUNE_CONFIG[type] : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCharge, setNeedCharge] = useState(false);

  // daily 는 전용 페이지, tarot/비활성은 동적 입력 대상 아님
  const valid = !!cfg && cfg.active && cfg.base === "saju" && cfg.type !== "daily";

  useEffect(() => {
    if (!valid) router.replace("/fortune");
  }, [valid, router]);

  if (!cfg || !valid) return null;

  const handleSubmit = async (input: SajuInput) => {
    setLoading(true);
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

    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: cfg.type, input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.code === "INSUFFICIENT_STARS") {
          setError("별이 모자라. 충전소에서 별을 채우고 다시 올래?");
          setNeedCharge(true);
        } else {
          setError(
            data?.error === "rate_limited"
              ? "조금만 천천히! 잠시 후 다시 시도해줄래?"
              : "운세를 못 펼쳤어. 잠시 후 다시 시도해줄래?"
          );
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      router.push(`/fortune/result?id=${data.id}`);
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setLoading(false);
    }
  };

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

      <SajuInputForm onSubmit={handleSubmit} loading={loading} />

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

      <Link href="/fortune" className="mt-6 text-[12px] text-text-light/70 underline">
        다른 운세 보기
      </Link>
    </main>
  );
}
