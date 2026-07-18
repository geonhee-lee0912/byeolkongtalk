"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type TabKey = "consult" | "fortune" | "history" | "shop" | "me";

interface TabDef {
  key: TabKey;
  label: string;
  href: string;
  /** 활성 판단용 prefix 목록 — 첫 매치되는 prefix 가 있으면 active */
  matchPrefixes: string[];
  /** Material Design Icons (Pictogrammers, Apache 2.0) 24x24 single-path */
  /** 비선택 — line(outline) */
  iconLine: string;
  /** 선택 — filled */
  iconFill: string;
}

const ICON_CLASS = "w-[22px] h-[22px]";

const TABS: TabDef[] = [
  {
    key: "consult",
    label: "고민톡",
    href: "/",
    matchPrefixes: ["/", "/saju", "/concern", "/tarot"],
    // mdi message-text-outline / message-text
    iconLine:
      "M20,2A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H6L2,22V4C2,2.89 2.9,2 4,2H20M4,4V17.17L5.17,16H20V4H4M6,7H18V9H6V7M6,11H15V13H6V11Z",
    iconFill:
      "M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M6,9H18V11H6M14,14H6V12H14M18,8H6V6H18",
  },
  {
    key: "fortune",
    label: "사주톡",
    href: "/fortune",
    matchPrefixes: ["/fortune"],
    // mdi star-four-points-outline / star-four-points
    iconLine:
      "M12,6.7L13.45,10.55L17.3,12L13.45,13.45L12,17.3L10.55,13.45L6.7,12L10.55,10.55L12,6.7M12,1L9,9L1,12L9,15L12,23L15,15L23,12L15,9L12,1Z",
    iconFill: "M12,1L9,9L1,12L9,15L12,23L15,15L23,12L15,9L12,1Z",
  },
  {
    key: "history",
    label: "우리 사이",
    href: "/relationship",
    matchPrefixes: ["/relationship"],
    // mdi heart-outline / heart
    iconLine:
      "M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.36H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z",
    iconFill:
      "M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z",
  },
  {
    key: "shop",
    label: "별콩 상점",
    href: "/shop",
    matchPrefixes: ["/shop"],
    // mdi star-circle-outline / star-circle
    iconLine:
      "M8.58,17.25L9.5,13.36L6.5,10.78L10.45,10.41L12,6.8L13.55,10.45L17.5,10.78L14.5,13.36L15.42,17.25L12,15.19L8.58,17.25M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z",
    iconFill:
      "M16.23,18L12,15.45L7.77,18L8.89,13.19L5.16,9.96L10.08,9.54L12,5L13.92,9.53L18.84,9.95L15.11,13.18L16.23,18M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
  },
  {
    key: "me",
    label: "내 정보",
    href: "/mypage",
    matchPrefixes: ["/mypage"],
    // mdi account-outline / account
    iconLine:
      "M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6M12,13C14.67,13 20,14.33 20,17V20H4V17C4,14.33 9.33,13 12,13M12,14.9C9.03,14.9 5.9,16.36 5.9,17V18.1H18.1V17C18.1,16.36 14.97,14.9 12,14.9Z",
    iconFill:
      "M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z",
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
  // 내 고민톡에서 다시보기로 진입하면 (?from=history) 목적지 탭이 아니라
  // 항상 "내 고민톡" 탭이 filled 되도록 강제한다.
  const fromHistory = useSearchParams().get("from") === "history";
  const [meUnread, setMeUnread] = useState(0);
  useEffect(() => {
    void fetch("/api/inquiries/unread-count", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => {
        if (d) setMeUnread(d.count ?? 0);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-cream/95 backdrop-blur-md border-t border-lilac-soft/70"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="주요 메뉴"
    >
      <div className="max-w-md mx-auto h-16 flex items-stretch px-1">
        {TABS.map((tab, i) => {
          const active = fromHistory
            ? tab.key === "history"
            : isActive(pathname, tab);
          return (
            <Fragment key={tab.key}>
              {i > 0 && (
                <span
                  className="my-3 w-px self-stretch bg-lilac-soft/70"
                  aria-hidden
                />
              )}
              <Link
                href={tab.href}
                className={[
                  "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                  active
                    ? "text-lilac-deep"
                    : "text-text-light hover:text-eye-purple",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <svg
                    className={ICON_CLASS}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d={active ? tab.iconFill : tab.iconLine} />
                  </svg>
                  {tab.key === "me" && meUnread > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 flex h-2 w-2"
                      aria-label="새 답변"
                    >
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lilac-deep opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-lilac-deep" />
                    </span>
                  )}
                </span>
                <span
                  className={[
                    "text-[10.5px] leading-none tracking-tight",
                    active ? "font-bold" : "font-medium",
                  ].join(" ")}
                >
                  {tab.label}
                </span>
              </Link>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
