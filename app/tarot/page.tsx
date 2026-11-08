"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PENDING_KEY, type PendingConsultation } from "@/lib/emotions";
import SpreadPicker from "@/components/tarot/SpreadPicker";

// /tarot — 스프레드 고르기. (메뉴판 반반은 2026-10-25 판정에서 옛 타로톡 승 — 메뉴판 분기는 정리 배포로 걷어냈다)
export default function TarotPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingConsultation | null>(null);

  useEffect(() => {
    const raw =
      typeof window !== "undefined" ? sessionStorage.getItem(PENDING_KEY) : null;
    if (!raw) {
      router.replace("/");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PendingConsultation;
      if (parsed.type !== "tarot" || !parsed.concern) {
        router.replace("/concern");
        return;
      }
      setPending(parsed);
    } catch {
      router.replace("/");
    }
  }, [router]);

  const loading = (
    <main className="flex flex-1 items-center justify-center px-5">
      <p className="text-text-light text-sm">잠시만…</p>
    </main>
  );
  if (!pending) return loading;
  return <SpreadPicker pending={pending} />;
}
