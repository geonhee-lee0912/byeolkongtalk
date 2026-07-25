"use client";

// 라우트 이동마다 /api/pv 로 1건 전송. anon/user 귀속은 서버가 httpOnly 쿠키로 처리하므로
// 클라는 path 와 utm 만 보낸다.
//
// 동작 위치: root layout (Suspense 내부 — useSearchParams 사용).

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function PageViewBeacon() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const lastRef = useRef<string>("");

  useEffect(() => {
    if (!pathname) return;
    // StrictMode 이중 실행·쿼리 변경 재렌더로 같은 경로가 두 번 찍히는 것 차단
    if (lastRef.current === pathname) return;
    lastRef.current = pathname;

    const body = JSON.stringify({
      path: pathname,
      utm_source: sp.get("utm_source") ?? undefined,
      utm_medium: sp.get("utm_medium") ?? undefined,
      utm_campaign: sp.get("utm_campaign") ?? undefined,
      utm_content: sp.get("utm_content") ?? undefined,
      utm_term: sp.get("utm_term") ?? undefined,
      landing_variant: sp.get("v") ?? undefined,
      referrer: document.referrer ? document.referrer.slice(0, 200) : undefined,
    });

    try {
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon("/api/pv", blob)) {
        void fetch("/api/pv", {
          method: "POST",
          body,
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch {
      // 계측 실패는 무음
    }
  }, [pathname, sp]);

  return null;
}
