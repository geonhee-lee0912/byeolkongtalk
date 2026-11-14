"use client";

// 앱 헤더 — 앱 안에서만 보인다(app-only). 탭 첫 화면은 제목 + 별 잔액, 하위 화면은 ‹ + 가운데 제목. 스펙 2026-11-07-앱-화면 §4, 시안 ①.
// 🔴 높이는 웹 헤더와 같은 h-14 — 이 높이에 기대는 화면이 있다(saju/reading 의 top-[3.5rem]).
// 상태바와 이어지게 단색 cream(앱 SafeAreaView 배경과 같다). 계정·잔액은 웹 헤더가 넘겨준다(한 번만 불러오게).
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { appScreen, backGoesToTabRoot, depthOnChange } from "@/lib/app-shell/screens";
import { markBackButton, requestBack } from "@/lib/app-shell/nav-direction";
import { runBackTransition } from "./AppNavDirection";
import type { HeaderUser } from "./useHeaderAccount";
import Icon from "@/components/common/Icon";
import HeaderActionButton, { useHeaderAction } from "./HeaderActionButton";

/** '‹' 를 눌렀는데 이 시간 안에 기록 뒤로(popstate)가 안 오면(기록 맨 앞 — 웹뷰에서 뒤로가 아무 일도 안 함) 탭 첫 화면으로 바꿔 연다 */
const BACK_STUCK_MS = 400;

// 앱 안 기록 깊이 — 헤더가 다시 그려져도 이어지게 모듈에 둔다. 경로+쿼리로 센다(쿼리만 바뀐 이동도 기록 한 칸 — 아래 AppHistoryDepth). 셸이 숨는 화면(/login 등)을 거친 이동은 세지 못해 적게 셀 수 있고,
// router.replace 를 push 로 세어 많게 셀 수도 있다 — 많게 센 경우는 requestBack 의 BACK_STUCK_MS 가 막는다
let depth = 0;
let lastKey: string | null = null;
let popped = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    popped = true;
  });
}

/** 기록 깊이 세기 — 쿼리를 읽어야 해서(useSearchParams) AppShell 이 Suspense 안에 따로 둔다 */
export function AppHistoryDepth() {
  const pathname = usePathname() || "/";
  const search = useSearchParams()?.toString() ?? "";
  const key = search ? `${pathname}?${search}` : pathname;
  useEffect(() => {
    depth = depthOnChange(depth, lastKey, key, popped);
    popped = false;
    lastKey = key;
  }, [key]);
  return null;
}

export default function AppHeader({ user, balance }: { user: HeaderUser | null; balance: number | null }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const screen = appScreen(pathname);
  // 화면이 오른쪽 버튼을 올렸으면 양옆 칸을 넓혀 제목을 가운데에 둔다(지금은 타로 대화의 '결과 보기')
  const hasAction = useHeaderAction() !== null;

  const goBack = () => {
    if (screen.kind !== "sub") return;
    const root = screen.tabRoot;
    // 카드 뽑기에서 막 들어온 타로 대화는 기록 뒤(카드 뽑기)가 아니라 홈으로(lib/app-shell/screens backGoesToTabRoot)
    if (depth === 0 || backGoesToTabRoot(pathname, window.location.search)) {
      router.replace(root);
      return;
    }
    // 대기 중 두 번째 누름은 무시하고, 막힘은 경로가 아니라 popstate 수신으로 판단한다(같은 경로 칸으로 돌아가는 화면이 있다)
    requestBack(
      window,
      () => {
        markBackButton();
        runBackTransition(() => router.back());
      },
      () => router.replace(root),
      BACK_STUCK_MS,
    );
  };

  return (
    <header className="app-only sticky top-0 z-50 h-14 bg-cream">
      {screen.kind === "tab" ? (
        <div className="max-w-md mx-auto h-14 flex items-center justify-between px-5">
          {/* 탭 제목은 로고 글꼴·진보라, 비로그인 로그인은 잔액 알약과 같은 자리·모양(테두리 알약) — 디자인 다듬기 ② 헤더 운영자 B·2안(11-12) */}
          <span className="font-display text-22 text-eye-purple">{screen.title}</span>
          {user ? (
            <Link
              href="/shop"
              data-nav="tab"
              className="flex items-center gap-1 px-2.5 h-8 rounded-full bg-cream-warm border border-lilac-mid/40"
              aria-label="별콩 상점"
            >
              <span className="text-13 leading-none" aria-hidden>
                <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />
              </span>
              <span className="text-12 font-bold text-eye-purple leading-none tabular-nums">{balance ?? "-"}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center px-3 h-8 rounded-full bg-cream-warm border border-lilac-mid/40 text-13 font-bold text-eye-purple"
            >
              로그인
            </Link>
          )}
        </div>
      ) : (
        <div className={`max-w-md mx-auto h-14 grid ${hasAction ? "grid-cols-[96px_1fr_96px]" : "grid-cols-[48px_1fr_48px]"} items-center border-b border-lilac-soft/60`}>
          <button
            type="button"
            onClick={goBack}
            aria-label="뒤로"
            className="h-12 w-12 flex items-center justify-center text-eye-purple"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="text-center text-17 font-bold text-eye-purple truncate">{screen.title}</span>
          {hasAction ? (
            <span className="flex justify-end pr-3">
              <HeaderActionButton />
            </span>
          ) : (
            <span aria-hidden />
          )}
        </div>
      )}
    </header>
  );
}
