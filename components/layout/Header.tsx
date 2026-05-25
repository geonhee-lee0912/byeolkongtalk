"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface UserInfo {
  id: string;
  nickname: string;
  profile_img: string | null;
}

export default function Header() {
  const [user, setUser] = useState<UserInfo | null>(null);
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

  return (
    <header className="sticky top-0 z-50 bg-cream/85 backdrop-blur-md border-b border-lilac-soft/60">
      <div className="max-w-md mx-auto h-14 flex items-center justify-between px-5">
        <Link
          href="/"
          className="font-display text-[22px] text-eye-purple tracking-wide font-bold"
        >
          별콩톡
        </Link>

        <div className="flex items-center gap-1.5">
          {user ? (
            <>
              {/* 별 잔액 */}
              <Link
                href="/shop"
                className="flex items-center gap-1 px-2.5 h-8 rounded-full bg-cream-warm border border-lilac-mid/40 hover:border-lilac-deep/60 transition-colors"
                aria-label="별콩 상점"
              >
                <span className="text-[13px] leading-none" aria-hidden>
                  ⭐
                </span>
                <span className="text-[12px] font-bold text-eye-purple leading-none tabular-nums">
                  {balance ?? "-"}
                </span>
              </Link>

              {/* MY — 프로필 아바타 + 닉네임 */}
              <Link
                href="/mypage"
                className="flex items-center gap-1.5 pl-1 pr-2.5 h-8 bg-white/70 rounded-full border border-lilac-soft hover:border-lilac-mid/60 hover:bg-white transition-colors"
                aria-label="내 정보"
              >
                <span className="relative w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-lilac-soft ring-1 ring-white/80">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      user.profile_img ||
                      `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(
                        user.nickname || "byeolkong"
                      )}&backgroundColor=ede6f8,d4c7ee,c0aede,f2d78a,e8c26a`
                    }
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </span>
                <span className="text-[12px] font-bold text-eye-purple leading-none tracking-wide max-w-[80px] truncate">
                  {user.nickname}
                </span>
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm text-text-light hover:text-eye-purple transition-colors"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
