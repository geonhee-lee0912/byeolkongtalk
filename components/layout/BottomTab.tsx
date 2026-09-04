"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type TabKey = "consult" | "fortune" | "byeolmaru" | "shop" | "me";

interface TabDef {
  key: TabKey;
  label: string;
  href: string;
  /** 활성 판단용 prefix 목록 — 첫 매치되는 prefix 가 있으면 active */
  matchPrefixes: string[];
  /** 솔리드(면으로 채운) 커스텀 글리프 — byeolkong 톤. 상태는 라인/필 2-state 가 아니라 색으로 구분. */
  icon: string;
  /** 별 구멍(knockout)이 있는 글리프는 evenodd 로 렌더 → 뒤 배경(pill·크림)이 비친다. */
  iconEvenOdd?: boolean;
}

const ICON_CLASS = "w-[22px] h-[22px]";

const TABS: TabDef[] = [
  {
    key: "consult",
    label: "타로톡",
    href: "/",
    matchPrefixes: ["/", "/saju", "/concern", "/tarot"],
    // 말풍선 + 별(구멍) — 타로 + 톡
    icon: "M5 4.3h13.2a2.3 2.3 0 0 1 2.3 2.3v8.5a2.3 2.3 0 0 1-2.3 2.3h-6.4L7.4 21v-3.6H5a2.3 2.3 0 0 1-2.3-2.3V6.6A2.3 2.3 0 0 1 5 4.3Zm6.7 3.4-1 2.3-2.3 1 2.3 1 1 2.3 1-2.3 2.3-1-2.3-1Z",
    iconEvenOdd: true,
  },
  {
    key: "fortune",
    label: "사주 운세",
    href: "/fortune",
    matchPrefixes: ["/fortune"],
    // 초승달 + 별
    icon: "M13.6 3A9 9 0 1 0 21 15.8 7.2 7.2 0 0 1 13.6 3Zm4.3 .4 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1Z",
  },
  {
    key: "byeolmaru",
    label: "별마루",
    href: "/byeolmaru",
    // 슬롯으로 들어간 /relationship 에서도 별마루 탭이 활성으로 보이게 — 유저가 위치를 잃지 않는다
    matchPrefixes: ["/byeolmaru", "/relationship"],
    // 달력 + 별(구멍) — 상단 고리 2개 + 본체, 가운데 4꼭지 별을 knockout
    icon: "M7.6 2.4h1.6v2h5.6v-2h1.6v2h1.8A2.3 2.3 0 0 1 20.5 6.7v12A2.3 2.3 0 0 1 18.2 21H5.8A2.3 2.3 0 0 1 3.5 18.7v-12A2.3 2.3 0 0 1 5.8 4.4h1.8v-2Zm4.4 8.6-1.05 2.4-2.4 1.05 2.4 1.05 1.05 2.4 1.05-2.4 2.4-1.05-2.4-1.05Z",
    iconEvenOdd: true,
  },
  {
    key: "shop",
    label: "별콩 상점",
    href: "/shop",
    matchPrefixes: ["/shop"],
    // 별 코인 (원 + 별 구멍, 중앙 정렬)
    icon: "M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Zm0 4.6-1.2 2.8-2.8 1.2 2.8 1.2 1.2 2.8 1.2-2.8 2.8-1.2-2.8-1.2Z",
    iconEvenOdd: true,
  },
  {
    key: "me",
    label: "마이",
    href: "/mypage",
    matchPrefixes: ["/mypage", "/readings"],
    // 사람 실루엣
    icon: "M12 4.2a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Zm0 8.4c4 0 7 1.95 7 4.35V20H5v-3.05c0-2.4 3-4.35 7-4.35Z",
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
  // 보관함(/readings)에서 다시보기로 진입하면 (?from=history) 목적지 탭이 아니라
  // 항상 "내 정보" 탭이 filled 되도록 강제한다 (보관함이 내 정보로 이동).
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
            ? tab.key === "me"
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
                  "flex-1 flex flex-col items-center justify-center px-1.5 transition-colors",
                  active
                    ? "text-eye-purple"
                    : "text-text-light hover:text-eye-purple",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {/* 선택 탭: 아이콘+라벨을 라일락 pill 로 함께 감싼다. 패딩은 항상 유지해 레이아웃 고정. */}
                <span
                  className={[
                    "w-full flex flex-col items-center justify-center gap-1 rounded-2xl py-1.5 transition-colors",
                    active ? "bg-lilac-soft" : "",
                  ].join(" ")}
                >
                  <span className="relative">
                    <svg
                      className={ICON_CLASS}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path
                        d={tab.icon}
                        fillRule={tab.iconEvenOdd ? "evenodd" : undefined}
                      />
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
                </span>
              </Link>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
