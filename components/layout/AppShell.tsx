"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import BottomTab from "./BottomTab";

/** Header/BottomTab 를 숨길 경로 (정확 매치 또는 prefix) */
const HIDE_SHELL_PREFIXES: string[] = [
  "/login",
  "/admin",
];

function shouldHideShell(pathname: string): boolean {
  return HIDE_SHELL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const hide = shouldHideShell(pathname);

  if (hide) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <div
        className="flex-1 flex flex-col"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
      <Suspense fallback={null}>
        <BottomTab />
      </Suspense>
    </>
  );
}
