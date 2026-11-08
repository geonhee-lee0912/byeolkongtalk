"use client";
/// <reference types="react/canary" />

import { Suspense, ViewTransition, useEffect } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import BottomTab from "./BottomTab";
import UserPopupGate from "@/components/popup/UserPopupGate";
import PushGate from "@/components/push/PushGate";
import AppNavDirection from "./AppNavDirection";
import AppPullRefresh from "./AppPullRefresh";
import { AppHistoryDepth } from "./AppHeader";
import { useAppInfo } from "@/lib/use-app-info";
import { overlayStack } from "@/lib/app-shell/overlay-stack";
import { installOverlayBridge } from "@/lib/app-shell/overlay-bridge";

/** Header/BottomTab 를 숨길 경로 (정확 매치 또는 prefix) */
const HIDE_SHELL_PREFIXES: string[] = [
  "/login",
  "/admin",
  "/start",
  "/relationship/sim",
];

function shouldHideShell(pathname: string): boolean {
  return HIDE_SHELL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const hide = shouldHideShell(pathname);
  // 웹(브라우저)에선 전환을 아예 열지 않는다("none") — prop 만 바뀌어 화면이 다시 마운트되지 않는다
  const { app } = useAppInfo();

  // 겹창 스택 ↔ 앱(caps ui 일 때만): 열림·닫힘을 알리고 안드로이드 뒤로 버튼(ui.back)으로 맨 위 창을 닫는다 — 셸을 숨기는 화면에서도
  useEffect(() => installOverlayBridge(window, overlayStack, app), [app]);

  if (hide) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      {/* 앱 화면 전환 — 방향은 <html data-nav>(AppNavDirection), 움직임은 globals.css 의 .app-nav. 값이 없으면 움직이지 않는다.
          전환 그림은 화면 묶음 전체(헤더 아래~탭바 뒤, 앱에선 불투명 배경) — 페이지 본문만 찍으면 투명한 틈으로 아래 화면이 비친다 */}
      <ViewTransition update={app ? "app-nav" : "none"} default="none">
        {/* data-app-page — ‹ 뒤로 전환이 복제·이동하는 화면 묶음(AppNavDirection runBackTransition) */}
        <div
          data-app-page
          className="flex-1 flex flex-col"
          style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </ViewTransition>
      <AppNavDirection />
      <AppPullRefresh />
      <Suspense fallback={null}>
        <AppHistoryDepth />
        <BottomTab />
      </Suspense>
      <UserPopupGate />
      {/* 앱 알림 — 수신거부 줄·2년 재확인 팝업·두 번째 실행 질문(앱 안에서만 일한다) */}
      <PushGate />
    </>
  );
}
