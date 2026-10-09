"use client";

import { useEffect, useState } from "react";
import { fetchWallet, parseWallet, type Wallet } from "./wallet";

/**
 * 지갑(잔액·선물 미사용·반반 그룹)을 마운트 때 한 번 읽는다. 읽는 중 = null.
 * 실패하면 안전한 기본값(잔액 0 · 선물 약속 없음 · 스위치가 정한 비로그인 그룹 — 반반 중엔 옛 그룹 = 지금 prod)으로 채운다 — 화면이 "잠시만…"에 멈추지 않게.
 * 결제 직전처럼 최신 잔액이 필요한 곳은 그 자리에서 fetchWallet 을 다시 부른다.
 */
export function useWallet(): Wallet | null {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchWallet().then((w) => {
      if (alive) setWallet(w ?? parseWallet(null));
    });
    return () => {
      alive = false;
    };
  }, []);
  return wallet;
}
