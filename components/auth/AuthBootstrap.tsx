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
import { ACQ_COOKIE, ACQ_KEYS, buildAcqPayload } from "@/lib/acquisition";

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

  // first-touch 유입 캡처: utm/fbclid 가 있고 아직 acq 쿠키가 없으면 1회 기록.
  // 쿠키가 이미 있으면 덮어쓰지 않음(first-touch 보존). 오가닉(파라미터 없음)은 무시.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.cookie.includes(`${ACQ_COOKIE}=`)) return;

    const params: Record<string, string | undefined> = {};
    for (const k of ACQ_KEYS) params[k] = sp.get(k) ?? undefined;
    const payload = buildAcqPayload(params);
    if (!payload) return;

    // 보조 신호
    payload.first_seen_at = new Date().toISOString();
    // 랜딩 종류: 전용 v 우선(어느 광고 랜딩이든), utm_content 는 레거시 /start 폴백.
    // (utm_content 는 이제 소재명 전용이라 v 없이 이걸 landing_variant 로 쓰면 오염)
    const lv = sp.get("v") ?? (pathname === "/start" ? sp.get("utm_content") : null);
    if (lv) payload.landing_variant = lv;
    try {
      if (document.referrer) payload.referrer = document.referrer.slice(0, 200);
    } catch {}
    const fbc = document.cookie
      .split("; ")
      .find((c) => c.startsWith("_fbc="))
      ?.split("=")[1];
    if (fbc) payload.fbc = decodeURIComponent(fbc);

    const value = encodeURIComponent(JSON.stringify(payload));
    // 30일, 로그인 왕복(same-site 네비게이션)에 실려 서버로 감. httpOnly 아님(클라 기록).
    document.cookie = `${ACQ_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, [sp, pathname]);

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
