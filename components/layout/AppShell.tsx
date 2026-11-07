"use client";
/// <reference types="react/canary" />

import { Suspense, ViewTransition } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import BottomTab from "./BottomTab";
import UserPopupGate from "@/components/popup/UserPopupGate";
import AppNavDirection from "./AppNavDirection";
import { useAppInfo } from "@/lib/use-app-info";

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

  if (hide) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      {/* data-app-page — ‹ 뒤로 전환이 복제·이동하는 화면 묶음(AppNavDirection runBackTransition) */}
      <div
        data-app-page
        className="flex-1 flex flex-col"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {/* 앱 화면 전환 — 방향은 <html data-nav>(AppNavDirection), 움직임은 globals.css 의 .app-nav. 값이 없으면 움직이지 않는다 */}
        <ViewTransition update={app ? "app-nav" : "none"} default="none">
          {children}
        </ViewTransition>
      </div>
      <AppNavDirection />
      <Suspense fallback={null}>
        <BottomTab />
      </Suspense>
      <UserPopupGate />
    </>
  );
}
