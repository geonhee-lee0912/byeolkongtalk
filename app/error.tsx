"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 에러 발생 즉시 자체 로거로 전송 (lib/logger.ts → /api/log/error)
    void fetch("/api/log/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: error.message || "Unknown client error",
        stack: error.stack ?? null,
        fingerprint: error.digest ?? null,
        route:
          typeof window !== "undefined" ? window.location.pathname : null,
        context: { digest: error.digest },
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-5 text-center animate-fade-in">
      <Image
        src="/byeolkong-curious.png"
        alt=""
        width={120}
        height={120}
        className="mb-4"
        aria-hidden
      />
      <h1 className="font-display text-[28px] text-eye-purple mb-2">
        별콩이가 잠깐 별을 놓쳤어
      </h1>
      <p className="text-[14px] text-text-light mb-6 leading-relaxed">
        하늘이 잠시 흐려졌나봐.
        <br />
        다시 한 번 시도해줄래?
      </p>

      <div className="flex flex-col gap-2 w-full max-w-[260px]">
        <button
          onClick={() => reset()}
          className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] hover:bg-lilac-deep/90 transition"
        >
          다시 시도하기
        </button>
        <Link
          href="/"
          className="w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[14px] hover:bg-lilac-deep/5 transition"
        >
          홈으로 돌아가기
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 text-[11px] text-text-light/50 font-mono">
          {error.digest}
        </p>
      )}
    </div>
  );
}
