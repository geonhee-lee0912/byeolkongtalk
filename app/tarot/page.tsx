"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PENDING_KEY, type PendingConsultation } from "@/lib/emotions";
import { useWallet } from "@/lib/use-wallet";
import SpreadPicker from "@/components/tarot/SpreadPicker";
import TarotMenu from "@/components/tarot/TarotMenu";

// /tarot — 반반 비교(A/B)의 갈림길. 메뉴판 그룹은 질문 메뉴판, 옛 그룹은 지금 prod 의 스프레드 고르기.
// 그룹은 서버가 user_id 로 계산해 /api/stars/balance 의 menuArm 으로 준다(lib/tarot/menu-ab.ts). 스펙 §9-1
export default function TarotPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingConsultation | null>(null);
  const wallet = useWallet();

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

  if (!pending || !wallet) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }
  if (wallet.menuArm === "menu") return <TarotMenu pending={pending} wallet={wallet} />;
  return <SpreadPicker pending={pending} />;
}
