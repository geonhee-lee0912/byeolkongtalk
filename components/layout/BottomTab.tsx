"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "consult" | "fortune" | "history" | "shop" | "me";

interface TabDef {
  key: TabKey;
  label: string;
  href: string;
  /** 활성 판단용 prefix 목록 — 첫 매치되는 prefix 가 있으면 active */
  matchPrefixes: string[];
  icon: (active: boolean) => React.ReactNode;
}

const ICON_CLASS = "w-[22px] h-[22px]";

const TABS: TabDef[] = [
  {
    key: "consult",
    label: "고민 상담",
    href: "/",
    matchPrefixes: ["/", "/saju"],
    icon: (active) => (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 12c0 4.4-4 8-9 8-1.3 0-2.6-.2-3.7-.7L3 21l1.5-4.2C3.5 15.5 3 13.8 3 12c0-4.4 4-8 9-8s9 3.6 9 8z" />
      </svg>
    ),
  },
  {
    key: "fortune",
    label: "별콩 운세",
    href: "/fortune",
    matchPrefixes: ["/fortune"],
    icon: (active) => (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3l1.9 4.6L18.8 8l-3.6 3.2 1 4.9L12 13.7 7.8 16l1-4.9L5.2 8l4.9-.4L12 3z" />
        <path d="M19 14l.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5.5-1.6z" />
      </svg>
    ),
  },
  {
    key: "history",
    label: "내 고민톡",
    href: "/readings",
    matchPrefixes: ["/readings"],
    icon: (active) => (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 5h13a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8l-4 3V5z" />
        <path d="M8 10h8M8 13h5" />
      </svg>
    ),
  },
  {
    key: "shop",
    label: "별콩 상점",
    href: "/shop",
    matchPrefixes: ["/shop"],
    icon: (active) => (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16l-5.1 2.6 1-5.6L3.8 9l5.7-.8L12 3z" />
      </svg>
    ),
  },
  {
    key: "me",
    label: "내 정보",
    href: "/mypage",
    matchPrefixes: ["/mypage"],
    icon: (active) => (
      <svg
        className={ICON_CLASS}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    ),
  },
];

function isActive(pathname: string, tab: TabDef): boolean {
  // 정확 매치 또는 prefix 매치. "/" 는 정확 매치만 (모든 페이지가 / 로 시작하니까)
  return tab.matchPrefixes.some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)
  );
}

export default function BottomTab() {
  const pathname = usePathname() || "/";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-cream/95 backdrop-blur-md border-t border-lilac-soft/70"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="주요 메뉴"
    >
      <div className="max-w-md mx-auto h-16 flex items-stretch">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                active
                  ? "text-lilac-deep"
                  : "text-text-light hover:text-eye-purple",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {tab.icon(active)}
              <span
                className={[
                  "text-[10.5px] leading-none tracking-tight",
                  active ? "font-bold" : "font-medium",
                ].join(" ")}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
