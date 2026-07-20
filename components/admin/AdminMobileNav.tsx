"use client";

// 모바일 어드민 네비 — ☰ 버튼 + 왼쪽 슬라이드 드로어. 메뉴는 AdminNav 재사용.
// 어드민 레이아웃엔 transform 조상이 없어 포털 없이 fixed 로 충분.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";

export function AdminMobileNav({ badges, errBadge }: { badges: Record<string, number>; errBadge: { err: number; warn: number } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]); // 링크 이동 시 자동 닫힘

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="p-1.5 -ml-1.5 rounded-lg text-white/80 hover:bg-white/10"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-night-deep border-r border-white/10 flex flex-col animate-fade-in">
            <div className="px-5 py-5 border-b border-white/10 flex items-center">
              <span className="font-display text-[20px] tracking-wide">별콩 어드민</span>
              <button onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="ml-auto p-1 text-white/60 hover:text-white">✕</button>
            </div>
            <AdminNav badges={badges} errBadge={errBadge} />
            <div className="p-3 border-t border-white/10">
              <Link href="/" className="px-3 py-2 text-[12px] text-white/60 hover:text-white">← 사용자 화면으로</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
