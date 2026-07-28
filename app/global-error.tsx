"use client";

// global-error.tsx — 루트 레이아웃 자체가 깨졌을 때의 fallback.
// app/error.tsx 가 처리하지 못한 에러만 여기로 옴.
// 자체 <html><body> 를 가져야 함 (Tailwind 토큰 못 씀 — inline style).

import { useEffect } from "react";
import {
  chunkErrorDeploymentId,
  isChunkLoadError,
  tryRecoverFromChunkError,
} from "@/lib/chunk-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    void fetch("/api/log/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: chunkError ? "warn" : "error",
        message: `[GLOBAL] ${error.message || "Unknown global error"}`,
        stack: error.stack ?? null,
        fingerprint: chunkError ? "chunk-load-error" : (error.digest ?? null),
        route:
          typeof window !== "undefined" ? window.location.pathname : null,
        context: chunkError
          ? {
              kind: "chunk-load",
              dpl: chunkErrorDeploymentId(error),
              scope: "global",
            }
          : { digest: error.digest, scope: "global" },
      }),
      keepalive: true,
    }).catch(() => {});

    tryRecoverFromChunkError(error);
  }, [error, chunkError]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #1F1735 0%, #2A1F4D 50%, #5A3E8C 100%)",
          color: "white",
          fontFamily:
            "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✨</div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 12px",
              letterSpacing: "-0.01em",
            }}
          >
            하늘 전체가 잠깐 흐려졌어
          </h1>
          <p
            style={{
              fontSize: 14,
              opacity: 0.8,
              lineHeight: 1.6,
              margin: "0 0 24px",
            }}
          >
            예상치 못한 문제가 생겼어.
            <br />
            잠시 후 다시 들러줄래?
          </p>
          <button
            onClick={() => (chunkError ? window.location.reload() : reset())}
            style={{
              padding: "12px 24px",
              borderRadius: 12,
              background: "#E8C26A",
              color: "#1F1735",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            다시 시도하기
          </button>
        </div>
      </body>
    </html>
  );
}
