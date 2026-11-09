"use client";

// 사주 탭 비로그인 웰컴 별 배너 — 사주 광고(/fortune?chip=fun)로 온 신규는 홈을 안 거쳐 웰컴 별을 모른다.
// 10별 사주 단품은 웰컴 별로 바로 살 수 있다는 걸 결정 전에 알린다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { WELCOME_BONUS_STARS } from "@/lib/constants";
import { SAJU_SINGLE_COST } from "@/lib/fortune/types";
import Icon from "@/components/common/Icon";

export default function WelcomeStarsBanner() {
  // null = 확인 전 → 아무것도 안 그린다. 로그인 유저에게 깜빡이지 않게.
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        // 🔴 비로그인이 확실할 때만(=== false). 확인 실패면 숨긴다 — 로그인 유저에게 "선물"을 약속하지 않게.
        if (alive && me?.isAuthenticated === false) {
          setNext(window.location.pathname + window.location.search);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!next) return null;

  return (
    <div className="w-full max-w-md mx-auto px-4 pt-4">
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-gold-wash text-left animate-fade-in active:scale-[0.99] transition"
      >
        <span className="text-20 shrink-0"><Icon name="star" size={16} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-13 font-bold text-eye-purple leading-tight">
            카카오로 시작하면 별 {WELCOME_BONUS_STARS}개 선물
          </p>
          <p className="text-12 text-eye-purple/75 mt-0.5 leading-tight">
            <Icon name="star" size={14} className="inline align-[-2px]" />{SAJU_SINGLE_COST} 리포트는 그걸로 바로 볼 수 있어
          </p>
        </div>
        <span className="text-eye-purple/60 text-17 shrink-0"><Icon name="chev_r" size={16} /></span>
      </Link>
    </div>
  );
}
