"use client";

// 1) 카카오 OAuth 콜백 (?login=success) 감지 → localStorage 갱신
// 2) 모든 진입 시 서버 세션과 localStorage 를 sync.
//    쿠키 만료(1년) / 유저 DB 삭제 / 카카오 unlink 후엔 서버는 unauthenticated 인데
//    localStorage 만 살아있을 수 있음 → 클라가 "로그인됨" 으로 오인하다 401.
//    진입 시 한 번 검증해서 정리.
//
// 동작 위치: root layout 에 마운트되어 모든 라우트에서 한 번만 실행됨.

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SYNC_FLAG = "byeolkong:auth-sync";

function clearAuthLocalStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("byeolkong_user");
  localStorage.removeItem("byeolkong_token");
  window.dispatchEvent(new CustomEvent("byeolkong:user-updated"));
}

function setAuthLocalStorage(user: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem("byeolkong_user", JSON.stringify(user));
  localStorage.setItem("byeolkong_token", "kakao");
  window.dispatchEvent(new CustomEvent("byeolkong:user-updated"));
}

export default function AuthBootstrap() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const login = sp.get("login");
    const isCallback = login === "success";

    // sessionStorage flag — 같은 탭 중복 sync 방지 (callback 케이스는 강제 갱신).
    // 지난 sync 결과("authed"|"anon")가 현재 localStorage 와 일치할 때만 스킵 —
    // 어긋나 있으면(콜백 직후 이동으로 sync 가 끊긴 경우 등) 재동기화로 자가 치유.
    if (!isCallback && typeof window !== "undefined") {
      const prev = sessionStorage.getItem(SYNC_FLAG);
      let hasLocal = false;
      try {
        hasLocal = !!localStorage.getItem("byeolkong_user");
      } catch {}
      const consistent =
        (prev === "authed" && hasLocal) || (prev === "anon" && !hasLocal);
      if (consistent) return;
    }

    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (typeof window === "undefined") return;
        sessionStorage.setItem(
          SYNC_FLAG,
          data?.isAuthenticated && data.user ? "authed" : "anon"
        );

        if (data?.isAuthenticated && data.user) {
          setAuthLocalStorage(data.user);
        } else {
          // 서버 unauthenticated. localStorage 에 user 가 남아있으면 정리
          if (localStorage.getItem("byeolkong_user")) {
            clearAuthLocalStorage();
            window.dispatchEvent(new CustomEvent("byeolkong:session-expired"));
          }
        }
      })
      .catch(() => {
        // 네트워크 에러는 swallow — 세션 갱신 실패해도 기존 상태 유지
      })
      .finally(() => {
        if (!isCallback) return;
        // 콜백 파라미터 정리 전에 이미 다른 페이지로 이동했다면(/start 자동 진행 등)
        // stale pathname 으로 replace 하면 사용자를 도로 끌어온다 — 건너뛴다.
        if (window.location.pathname !== pathname) return;
        // /start 는 login/welcome 파라미터를 스스로 소비·정리한다(웰컴 팝업/자동 진행).
        // 여기서 먼저 지우면 Suspense 하이드레이션 타이밍에 따라 팝업이 유실된다.
        if (pathname === "/start") return;
        const params = new URLSearchParams(sp.toString());
        params.delete("login");
        params.delete("welcome");
        params.delete("migrated");
        params.delete("reason");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
  }, [sp, pathname, router]);

  return null;
}
