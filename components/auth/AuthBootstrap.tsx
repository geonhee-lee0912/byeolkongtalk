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

    // sessionStorage flag — 같은 탭 중복 sync 방지 (callback 케이스는 강제 갱신)
    if (
      !isCallback &&
      typeof window !== "undefined" &&
      sessionStorage.getItem(SYNC_FLAG) === "1"
    ) {
      return;
    }

    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (typeof window === "undefined") return;
        sessionStorage.setItem(SYNC_FLAG, "1");

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
