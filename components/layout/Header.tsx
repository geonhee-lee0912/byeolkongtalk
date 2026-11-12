"use client";

import Image from "next/image";
import Link from "next/link";
import AppHeader from "./AppHeader";
import { useHeaderAccount } from "./useHeaderAccount";
import Icon from "@/components/common/Icon";

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
              {/* 별 잔액만 — 앱 헤더와 같게. 내 정보는 아래 '마이' 탭(얼굴·이름 알약은 뺌, 디자인 다듬기 ② 헤더 운영자 A안 11-12) */}
              <Link
                href="/shop"
                className="flex items-center gap-1 px-2.5 h-8 rounded-full bg-cream-warm border border-lilac-mid/40 hover:border-lilac-deep/60 transition-colors"
                aria-label="별콩 상점"
              >
                <span className="text-13 leading-none" aria-hidden>
                  <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />
                </span>
                <span className="text-12 font-bold text-eye-purple leading-none tabular-nums">
                  {balance ?? "-"}
                </span>
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center px-3 h-8 rounded-full bg-cream-warm border border-lilac-mid/40 hover:border-lilac-deep/60 text-13 font-bold text-eye-purple transition-colors"
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
