"use client";

// global-error.tsx — 루트 레이아웃 자체가 깨졌을 때의 fallback.
// app/error.tsx 가 처리하지 못한 에러만 여기로 옴.
// 자체 <html><body> 를 가져야 함 (Tailwind 토큰 못 씀 — inline style).
// 모양은 app/error.tsx 와 한 짝(디자인 다듬기 묶음 9 ⑨ A, 운영자 11-22) — 색·크기는 app/globals.css 토큰 값을 그대로 적는다.

import { useEffect } from "react";
import Image from "next/image";
import {
  chunkErrorDeploymentId,
  isChunkLoadError,
  tryRecoverFromChunkError,
} from "@/lib/chunk-error";
import { cafe24Ssurround } from "./fonts";

const BODY_FONT =
  "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif";

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
          boxSizing: "border-box",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F6F5F2",
          fontFamily: BODY_FONT,
          padding: "24px",
          textAlign: "center",
        }}
      >
        {/* 루트 레이아웃이 빠지면 화면 폭 설정도 같이 사라진다 */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <div style={{ width: "100%", maxWidth: 360 }}>
          <Image
            src="/byeolkong-curious.png"
            alt=""
            width={120}
            height={120}
            style={{ display: "block", objectFit: "contain", margin: "0 auto 16px" }}
            aria-hidden
          />
          <h1
            style={{
              fontFamily: `${cafe24Ssurround.style.fontFamily}, ${BODY_FONT}`,
              fontSize: 22,
              lineHeight: "30px",
              fontWeight: 400,
              color: "#5A3E8C",
              margin: "0 0 8px",
              wordBreak: "keep-all",
              textWrap: "balance",
            }}
          >
            하늘 전체가 잠깐 흐려졌어
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.625,
              color: "#726398",
              margin: "0 0 24px",
            }}
          >
            예상치 못한 문제가 생겼어.
            <br />
            잠시 후 다시 들러줄래?
          </p>
          <div style={{ maxWidth: 260, margin: "0 auto" }}>
            <button
              onClick={() => (chunkError ? window.location.reload() : reset())}
              style={{
                display: "block",
                boxSizing: "border-box",
                width: "100%",
                height: 52,
                padding: "0 20px",
                border: "none",
                borderRadius: 12,
                background: "#775CB0",
                color: "white",
                fontFamily: BODY_FONT,
                fontSize: 15,
                lineHeight: "22px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              다시 시도하기
            </button>
            {/* Link 가 아니라 a — 앱 틀이 깨진 상태라 문서를 통째로 새로 받는다 */}
            <a
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 52,
                marginTop: 8,
                color: "#5A3E8C",
                fontSize: 15,
                lineHeight: "22px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              홈으로 돌아가기
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
