"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SajuInputForm from "@/components/saju/SajuInputForm";
import SajuBoard from "@/components/saju/SajuBoard";
import type { SajuInput, SajuResult } from "@/lib/saju/calc";
import { PENDING_KEY, type PendingConsultation } from "@/lib/emotions";

export default function SajuPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saju, setSaju] = useState<SajuResult | null>(null);
  const [lastInput, setLastInput] = useState<SajuInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (input: SajuInput) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/consultations/saju/calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error || "계산이 안 됐어. 잠시 후 다시 시도해줄래?");
        setLoading(false);
        return;
      }
      const data = await r.json();
      setSaju(data.saju);
      setLastInput(input);
      setLoading(false);
      // 결과로 부드럽게 스크롤
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setLoading(false);
    }
  };

  if (saju) {
    return (
      <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
        <div className="w-full max-w-md mx-auto px-5 mb-5 flex items-center justify-between">
          <button
            onClick={() => setSaju(null)}
            className="text-[12px] text-text-light/70 hover:text-text-light"
          >
            ‹ 다시 입력하기
          </button>
          <div className="text-[11px] text-text-light/60">
            {saju.input.inputCalendar === "lunar" ? "음력 입력" : "양력 입력"}
            {saju.input.isLeapMonth ? " · 윤달" : ""}
          </div>
        </div>

        <div className="w-full max-w-md mx-auto px-5 mb-5 text-center">
          <h1 className="font-display text-2xl font-bold text-eye-purple">
            너의 사주판이야 ✨
          </h1>
          <p className="mt-2 text-[13px] text-text-light leading-relaxed">
            일간 ★ 은 너의 본질을 나타내는 핵심 글자야
          </p>
        </div>

        <SajuBoard saju={saju} />

        <div className="w-full max-w-md mx-auto px-5 mt-8 flex flex-col gap-2.5">
          <button
            onClick={async () => {
              if (!lastInput) return;
              // 로그인 확인
              try {
                const r = await fetch("/api/auth/me", { cache: "no-store" });
                const data = r.ok ? await r.json() : null;
                if (!data?.isAuthenticated) {
                  window.location.href =
                    "/login?next=" + encodeURIComponent("/saju/concern");
                  return;
                }
              } catch {
                // 네트워크 실패 시 보수적으로 로그인 페이지로
                window.location.href =
                  "/login?next=" + encodeURIComponent("/saju/concern");
                return;
              }

              const profile = {
                displayName: "나",
                relationType: "self" as const,
                birthDate: `${lastInput.year}-${String(lastInput.month).padStart(2, "0")}-${String(lastInput.day).padStart(2, "0")}`,
                birthTime:
                  lastInput.hour !== null && lastInput.hour !== undefined
                    ? `${String(lastInput.hour).padStart(2, "0")}:${String(lastInput.minute ?? 0).padStart(2, "0")}`
                    : null,
                isLunarInput: lastInput.isLunar === true,
                isLeapMonth: lastInput.isLeapMonth === true,
                gender: lastInput.gender,
              };

              // /concern 에서 넘어온 케이스 → /saju/concern 건너뛰고 바로 readings INSERT
              const pendingRaw = sessionStorage.getItem(PENDING_KEY);
              let pending: PendingConsultation | null = null;
              try {
                pending = pendingRaw ? (JSON.parse(pendingRaw) as PendingConsultation) : null;
              } catch {
                pending = null;
              }

              if (pending && pending.type === "saju" && pending.concern) {
                try {
                  const res = await fetch("/api/readings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      profile,
                      sajuData: saju,
                      question: pending.concern,
                      emotion: pending.emotion,
                      sajuProduct: pending.sajuProduct,
                    }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data?.code === "INSUFFICIENT_STARS") {
                      window.location.href = "/shop";
                      return;
                    }
                    // 그 외 실패: pending 유지하고 legacy concern 페이지로 폴백
                    sessionStorage.setItem(
                      "byeolkong:pending_saju",
                      JSON.stringify({ saju, profile, emotion: pending.emotion, sajuProduct: pending.sajuProduct })
                    );
                    router.push("/saju/concern");
                    return;
                  }
                  const data = await res.json();
                  sessionStorage.setItem(
                    "byeolkong:current_reading",
                    JSON.stringify({
                      readingId: data.id,
                      saju,
                      question: pending.concern,
                    })
                  );
                  sessionStorage.removeItem(PENDING_KEY);
                  sessionStorage.removeItem("byeolkong:emotion");
                  router.push(`/saju/reading?id=${data.id}`);
                  return;
                } catch {
                  // 네트워크 실패: legacy concern 페이지로 폴백
                  sessionStorage.setItem(
                    "byeolkong:pending_saju",
                    JSON.stringify({ saju, profile, emotion: pending.emotion, sajuProduct: pending.sajuProduct })
                  );
                  router.push("/saju/concern");
                  return;
                }
              }

              // legacy 흐름: pending 없으면 기존 concern 페이지에서 입력받기
              sessionStorage.setItem(
                "byeolkong:pending_saju",
                JSON.stringify({ saju, profile })
              );
              router.push("/saju/concern");
            }}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
          >
            별콩이에게 풀이 듣기
          </button>
          <Link
            href="/"
            className="w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[14px] text-center hover:bg-lilac-deep/5 transition"
          >
            홈으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        <div className="relative animate-float">
          <Image
            src="/byeolkong-main.png"
            alt="별콩이"
            width={140}
            height={140}
            priority
          />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-eye-purple text-center">
          사주를 펼쳐볼까?
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          생일·시간·성별을 알려주면
          <br />
          별콩이가 너의 4기둥을 짚어줄게.
        </p>
      </div>

      <SajuInputForm onSubmit={handleSubmit} loading={loading} />

      {error && (
        <p className="mt-4 text-[12px] text-red-500 text-center px-5 max-w-md">
          {error}
        </p>
      )}

      <Link
        href="/"
        className="mt-6 text-[12px] text-text-light/70 underline"
      >
        나중에 할래
      </Link>
    </main>
  );
}
