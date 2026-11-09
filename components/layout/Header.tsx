"use client";

import Image from "next/image";
import Link from "next/link";
import AppHeader from "./AppHeader";
import { useHeaderAccount } from "./useHeaderAccount";

export default function Header() {
  const { user, balance } = useHeaderAccount();

  return (
    <>
    {/* 웹 헤더(web-only) + 앱 헤더(app-only) — 둘 다 그려 두고 CSS 로 하나를 숨긴다(스펙 2026-11-07-앱-화면 §3·§4) */}
    <header className="web-only sticky top-0 z-50 bg-cream/85 backdrop-blur-md border-b border-lilac-soft/60">
      <div className="max-w-md mx-auto h-14 flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-1.5">
          <span className="relative w-7 h-7 shrink-0 rounded-lg bg-lilac-soft flex items-center justify-center overflow-hidden">
            <Image
              src="/byeolkong-head.png"
              alt="별콩이"
              width={26}
              height={26}
              className="object-contain"
            />
          </span>
          <span className="font-display text-22 text-eye-purple tracking-wide font-bold">
            별콩톡
          </span>
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
                <span className="text-13 leading-none" aria-hidden>
                  ⭐
                </span>
                <span className="text-12 font-bold text-eye-purple leading-none tabular-nums">
                  {balance ?? "-"}
                </span>
              </Link>

              {/* MY — 프로필 아바타 + 닉네임 */}
              <Link
                href="/mypage"
                className="flex items-center gap-1.5 pl-1 pr-2.5 h-8 bg-white rounded-full border border-lilac-soft hover:border-lilac-mid/60 hover:bg-white transition-colors"
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
                <span className="text-12 font-bold text-eye-purple leading-none tracking-wide max-w-[80px] truncate">
                  {user.nickname}
                </span>
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="text-14 text-text-light hover:text-eye-purple transition-colors"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
    <AppHeader user={user} balance={balance} />
    </>
  );
}
