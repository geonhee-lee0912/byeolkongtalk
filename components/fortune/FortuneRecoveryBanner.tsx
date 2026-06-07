"use client";

// 결제 후 리포트 생성 중 이탈(뒤로가기)하면, 서버는 생성을 끝까지 마쳐 리딩을 만든다.
// 이 배너가 랜딩에서 pending 마커를 보고 그 리딩을 폴링으로 되찾아 "보러가기"로 안내한다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { readPendingFortune, clearPendingFortune } from "@/lib/fortune/pending";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

const DARK_GRADIENT = "linear-gradient(140deg, #2A1F4D, #1F1735)";

export default function FortuneRecoveryBanner() {
  const [foundId, setFoundId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const pending = readPendingFortune();
    if (!pending) return;
    setLabel(FORTUNE_CONFIG[pending.type]?.label ?? "운세");
    setChecking(true);

    let cancelled = false;
    let found = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const MAX = 50; // 약 2.5분 — 궁합 최장 생성(~90초) + 여유

    const checkOnce = async (): Promise<boolean> => {
      try {
        const r = await fetch(
          `/api/fortune/recent?type=${encodeURIComponent(pending.type)}&after=${encodeURIComponent(pending.after)}`,
          { cache: "no-store" }
        );
        const d = r.ok ? await r.json() : null;
        if (!cancelled && !found && d?.id) {
          found = true;
          setFoundId(d.id);
          setChecking(false);
          clearPendingFortune();
          return true;
        }
      } catch {
        /* 재시도 */
      }
      return false;
    };

    const poll = async () => {
      if (cancelled || found) return;
      attempts += 1;
      const done = await checkOnce();
      if (done || cancelled) return;
      if (attempts >= MAX) {
        // 마커는 지우지 않는다 — 다음 방문/새로고침에서 다시 시도(10분 내 자동 만료).
        setChecking(false);
        return;
      }
      timer = setTimeout(poll, 3000);
    };
    void poll();

    // 백그라운드 탭은 타이머가 스로틀돼 폴링이 멈춘다 → 탭 복귀 시 즉시 한 번 확인.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled && !found) {
        void checkOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (foundId) {
    return (
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <Link
          href={`/fortune/result?id=${foundId}&from=recover`}
          className="flex items-center gap-2 rounded-2xl px-4 py-3.5 text-[13px] font-bold text-cream shadow-lg active:scale-[0.99] transition"
          style={{ background: DARK_GRADIENT }}
        >
          <span className="text-gold">✨ 방금 만든 {label} 리포트가 준비됐어 · 보러가기 →</span>
        </Link>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div
          className="flex items-center gap-2.5 rounded-2xl px-4 py-3.5 text-[12.5px] font-medium text-cream/90 shadow-lg"
          style={{ background: DARK_GRADIENT }}
        >
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-cream/30 border-t-gold animate-spin" />
          방금 결제한 {label} 리포트를 불러오는 중이야…
        </div>
      </div>
    );
  }

  return null;
}
