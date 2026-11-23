"use client";

// 헤더의 계정·별 잔액 — 웹 헤더(Header)와 앱 헤더(AppHeader)가 같이 쓴다. 동작은 옛 Header 안의 두 effect 그대로.
import { useEffect, useState } from "react";

export interface HeaderUser {
  id: string;
  nickname: string;
  profile_img: string | null;
}

export function useHeaderAccount(): { user: HeaderUser | null; balance: number | null } {
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => {
      const stored = localStorage.getItem("byeolkong_user");
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("byeolkong:user-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("byeolkong:user-updated", sync);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    const fetchBalance = async () => {
      try {
        const r = await fetch("/api/stars/balance", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { balance?: number };
        if (!cancelled && typeof data.balance === "number") {
          setBalance(data.balance);
        }
      } catch {
        // ignore
      }
    };
    fetchBalance();
    const onUpdate = () => fetchBalance();
    window.addEventListener("byeolkong:balance-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("byeolkong:balance-updated", onUpdate);
    };
  }, [user]);

  return { user, balance };
}
