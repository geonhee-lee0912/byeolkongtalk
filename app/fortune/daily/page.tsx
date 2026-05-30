"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SajuInputForm from "@/components/saju/SajuInputForm";
import type { SajuInput } from "@/lib/saju/calc";

export default function FortuneDailyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (input: SajuInput) => {
    setLoading(true);
    setError(null);

    // 로그인 확인
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

    try {
      const res = await fetch("/api/fortune/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "daily", input }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error === "rate_limited"
            ? "조금만 천천히! 잠시 후 다시 시도해줄래?"
            : "운세를 못 펼쳤어. 잠시 후 다시 시도해줄래?"
        );
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
        <div className="relative animate-float">
          <Image src="/byeolkong-main.png" alt="별콩이" width={120} height={120} priority />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-eye-purple text-center">
          오늘의 운세
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          생일·시간·성별을 알려주면
          <br />
          별콩이가 오늘 하루 흐름을 한 장으로 정리해줄게.
        </p>
      </div>

      <SajuInputForm onSubmit={handleSubmit} loading={loading} />

      {error && (
        <p className="mt-4 text-[12px] text-red-500 text-center px-5 max-w-md">{error}</p>
      )}

      <Link href="/fortune" className="mt-6 text-[12px] text-text-light/70 underline">
        다른 운세 보기
      </Link>
    </main>
  );
}
