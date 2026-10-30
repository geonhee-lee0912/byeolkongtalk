"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PENDING_KEY, type PendingConsultation } from "@/lib/emotions";
import { useWallet } from "@/lib/use-wallet";
import { isNewFlowGuest } from "@/lib/tarot/entry-ab";
import SpreadPicker from "@/components/tarot/SpreadPicker";

// /tarot — 스프레드 고르기. (메뉴판 반반은 2026-10-25 판정에서 옛 타로톡 승 — 메뉴판 분기는 정리 배포로 걷어냈다)
export default function TarotPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingConsultation | null>(null);
  const wallet = useWallet("tarot_router");

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
  // 로그인 전 맛보기 — 새 흐름 그룹 비로그인만 '가입 선물 15별 신규 회원' 기준으로 그린다(스펙 2026-10-11 §3-1).
  // 옛 흐름 비로그인이 직접 들어와도 지금 화면 그대로(대조군 불변). 서버 차감은 로그인 뒤
  const guestNew = isNewFlowGuest(wallet);
  // 지갑 왕복을 기다리지 않고 바로 고르기 화면을 띄운다(지갑이 오면 guest 만 바뀐다)
  return <SpreadPicker pending={pending} guest={guestNew} />;
}
