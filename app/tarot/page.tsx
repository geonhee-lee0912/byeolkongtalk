"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PENDING_KEY, type PendingConsultation } from "@/lib/emotions";
import { useWallet } from "@/lib/use-wallet";
import { MENU_AB } from "@/lib/tarot/menu-ab";
import { isNewFlowGuest } from "@/lib/tarot/entry-ab";
import { guestWallet } from "@/lib/tarot/guest-price";
import SpreadPicker from "@/components/tarot/SpreadPicker";
import TarotMenu from "@/components/tarot/TarotMenu";

// /tarot — 반반 비교(A/B)의 갈림길. 메뉴판 그룹은 질문 메뉴판, 옛 그룹은 지금 prod 의 스프레드 고르기.
// 그룹은 서버가 user_id 로 계산해 /api/stars/balance 의 menuArm 으로 준다(lib/tarot/menu-ab.ts). 스펙 §9-1
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
  // 전원 옛 그룹(구현 중 잠금 · 판정 뒤 옛 그룹 승리)이면 그룹을 물을 필요가 없어 지금 prod 처럼 바로 고르기 화면을 띄운다.
  // 반반 중엔 그룹을 알아야 해서 지갑 왕복을 기다린다(다른 곳 #11).
  if (MENU_AB === "legacy") return <SpreadPicker pending={pending} guest={guestNew} />;
  if (!wallet) return loading;
  const shown = guestNew ? guestWallet(wallet.menuArm) : wallet;
  if (shown.menuArm === "menu") return <TarotMenu pending={pending} wallet={shown} />;
  return <SpreadPicker pending={pending} guest={guestNew} />;
}
