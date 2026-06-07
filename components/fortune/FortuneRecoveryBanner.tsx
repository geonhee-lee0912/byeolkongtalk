"use client";

// 결제 후 리포트 생성 중 이탈(뒤로가기)하면, 서버는 생성을 끝까지 마쳐 리딩을 만든다.
// 이 배너가 랜딩에서 pending 마커를 보고 그 리딩을 폴링으로 되찾아 "보러가기"로 안내한다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { readPendingFortune, clearPendingFortune } from "@/lib/fortune/pending";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

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
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const MAX = 25; // 약 75초

    const poll = async () => {
      attempts += 1;
      try {
        const r = await fetch(
          `/api/fortune/recent?type=${encodeURIComponent(pending.type)}&after=${encodeURIComponent(pending.after)}`,
          { cache: "no-store" }
        );
        const d = r.ok ? await r.json() : null;
        if (!cancelled && d?.id) {
          setFoundId(d.id);
          setChecking(false);
          clearPendingFortune();
          return;
        }
      } catch {
        /* 재시도 */
      }
      if (cancelled) return;
      if (attempts >= MAX) {
        setChecking(false);
        clearPendingFortune();
        return;
      }
      timer = setTimeout(poll, 3000);
    };
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (foundId) {
    return (
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <Link
          href={`/fortune/result?id=${foundId}&from=recover`}
          className="flex items-center gap-2 rounded-2xl bg-lilac-deep/10 border border-lilac-deep/40 px-4 py-3 text-[13px] font-bold text-lilac-deep active:scale-[0.99] transition"
        >
          <span>✨ 방금 만든 {label} 리포트가 준비됐어 · 보러가기 →</span>
        </Link>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="flex items-center gap-2 rounded-2xl bg-lilac-soft/40 border border-lilac-mid/40 px-4 py-3 text-[12.5px] text-text-light">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-lilac-deep/40 border-t-lilac-deep animate-spin" />
          방금 결제한 {label} 리포트를 불러오는 중이야…
        </div>
      </div>
    );
  }

  return null;
}
