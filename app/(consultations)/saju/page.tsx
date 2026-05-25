"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SajuInputForm from "@/components/saju/SajuInputForm";
import SajuBoard from "@/components/saju/SajuBoard";
import type { SajuInput, SajuResult } from "@/lib/saju/calc";

export default function SajuPage() {
  const [loading, setLoading] = useState(false);
  const [saju, setSaju] = useState<SajuResult | null>(null);
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
            disabled
            className="w-full py-3.5 rounded-xl bg-lilac-deep/50 text-white font-bold text-[15px] cursor-not-allowed"
          >
            별콩이에게 풀이 듣기 (곧 만나러 갈게)
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
