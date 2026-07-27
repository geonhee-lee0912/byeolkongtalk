"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  documentDeploymentId,
  isChunkLoadError,
  tryRecoverFromChunkError,
} from "@/lib/chunk-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 배포 스큐로 죽은 청크를 요청한 경우 — 앱 버그가 아니고 reset() 으로도 안 고쳐진다
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    // 에러 발생 즉시 자체 로거로 전송 (lib/logger.ts → /api/log/error)
    void fetch("/api/log/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: chunkError ? "warn" : "error",
        message: error.message || "Unknown client error",
        stack: error.stack ?? null,
        fingerprint: chunkError ? "chunk-load-error" : (error.digest ?? null),
        route:
          typeof window !== "undefined" ? window.location.pathname : null,
        // dpl = 지금 문서의 배포 ID. 에러 메시지 안의 dpl 과 다르면 스큐,
        // 같으면 현 빌드에 청크가 실제로 없는 것(= 진짜 버그)
        context: chunkError
          ? { kind: "chunk-load", dpl: documentDeploymentId() }
          : { digest: error.digest },
      }),
      keepalive: true,
    }).catch(() => {});

    // 하드 리로드로 1회 자활 (같은 배포에서 이미 시도했으면 no-op → 아래 폴백 UI)
    tryRecoverFromChunkError(error);
  }, [error, chunkError]);

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
          onClick={() => (chunkError ? window.location.reload() : reset())}
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
