"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ProfilePicker, { type PickerResult } from "@/components/saju/ProfilePicker";
import { PENDING_KEY, type PendingConsultation } from "@/lib/emotions";

export default function SajuPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (result: PickerResult) => {
    setLoading(true);
    setError(null);

    // 로그인 확인
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const data = r.ok ? await r.json() : null;
      if (!data?.isAuthenticated) {
        window.location.href = "/login?next=" + encodeURIComponent("/saju");
        return;
      }
    } catch {
      window.location.href = "/login?next=" + encodeURIComponent("/saju");
      return;
    }

    // pending(고민/감정/상품) 로드
    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    let pending: PendingConsultation | null = null;
    try {
      pending = pendingRaw ? (JSON.parse(pendingRaw) as PendingConsultation) : null;
    } catch {
      pending = null;
    }

    const question = pending?.concern ?? "사주 전반을 봐줘";
    const emotion = pending?.emotion;
    const sajuProduct = pending?.sajuProduct;

    // readings POST 본문: saved → profileId, inline → profile + save
    const base = {
      sajuData: result.saju,
      question,
      emotion,
      sajuProduct,
    };
    const body =
      result.kind === "saved"
        ? { ...base, profileId: result.profileId }
        : { ...base, profile: result.payload, save: result.save };

    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.code === "INSUFFICIENT_STARS") {
          window.location.href = "/shop";
          return;
        }
        setError("풀이를 시작하지 못했어. 잠시 후 다시 해줄래?");
        setLoading(false);
        return;
      }
      const data = await res.json();
      // reading 페이지는 byeolkong:current_reading 세션에서 컨텍스트를 로드한다.
      sessionStorage.setItem(
        "byeolkong:current_reading",
        JSON.stringify({ readingId: data.id, saju: result.saju, question })
      );
      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem("byeolkong:emotion");
      router.push(`/saju/reading?id=${data.id}`);
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        <div className="relative animate-float">
          <Image src="/byeolkong-main.png" alt="별콩이" width={140} height={140} priority />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-eye-purple text-center">
          누구 사주를 볼까?
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          저장된 사주에서 고르거나 새로 입력해줘.
        </p>
      </div>

      <ProfilePicker
        onConfirm={handleConfirm}
        confirmLabel="별콩이에게 풀이 듣기"
        loading={loading}
      />

      {error && (
        <p className="mt-4 text-[12px] text-red-500 text-center px-5 max-w-md">{error}</p>
      )}

      <Link href="/" className="mt-6 text-[12px] text-text-light/70 underline">
        나중에 할래
      </Link>
    </main>
  );
}
