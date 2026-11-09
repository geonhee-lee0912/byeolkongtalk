"use client";

// 안드로이드 앱의 당겨서 새로고침 — 탭 첫 화면 5개에서만, 앱이 caps 에 ui 를 실었을 때만 그린다(웹·아이폰·옛 앱은 null).
// 맨 위에서 아래로 끌면 위에 둥근 표시가 따라 내려오고, 72px 넘겨 놓으면 앱에 새로고침을 청한다(앱이 웹뷰를 다시 읽는다).
// 아이폰은 웹뷰 기본 기능(pullToRefreshEnabled)을 앱이 켠다. 겹창이 열려 있으면 무시한다. 스펙 2026-11-07-앱-화면 §5 ④
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppInfo } from "@/lib/use-app-info";
import { hasCap, isAppTabRoot } from "@/lib/app-bridge/protocol";
import { appRefresh } from "@/lib/app-context";
import { overlayStack } from "@/lib/app-shell/overlay-stack";
import { PULL_REFRESH_AT, pullDistance, shouldRefresh } from "@/lib/app-shell/pull-refresh";

/** 새로고침을 청한 뒤 다시 읽히지 않으면(앱이 못 받음) 표시를 거두는 시간 */
const GIVE_UP_MS = 4000;

export default function AppPullRefresh() {
  const { app } = useAppInfo();
  const pathname = usePathname() || "/";
  const on = !!app && app.platform === "android" && hasCap(app, "ui") && isAppTabRoot(pathname);
  const [dist, setDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);
  const distRef = useRef(0);

  useEffect(() => {
    if (!on) return;
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY === 0 && overlayStack.size() === 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const d = pullDistance(start.current, e.touches[0].clientY, window.scrollY);
      distRef.current = d;
      setDist(d);
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      if (shouldRefresh(distRef.current)) {
        setRefreshing(true);
        appRefresh();
        setTimeout(() => {
          setRefreshing(false);
          setDist(0);
        }, GIVE_UP_MS);
      } else {
        setDist(0);
      }
      distRef.current = 0;
    };
    // passive — 스크롤을 막지 않는다(맨 위에서 아래로 끄는 손가락은 원래 스크롤할 곳이 없다)
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [on]);

  if (!on || (dist === 0 && !refreshing)) return null;
  const y = refreshing ? PULL_REFRESH_AT : dist;
  const ready = refreshing || shouldRefresh(dist);
  return (
    <div
      aria-hidden
      className="fixed left-1/2 z-[45] pointer-events-none"
      style={{ top: "env(safe-area-inset-top)", transform: `translate(-50%, ${y - 40}px)` }}
    >
      <div className="w-9 h-9 rounded-full bg-cream shadow-float flex items-center justify-center">
        <span
          className={`block w-5 h-5 rounded-full border-2 border-lilac-soft border-t-eye-purple ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${dist * 3}deg)`, opacity: ready ? 1 : 0.6 }}
        />
      </div>
    </div>
  );
}
