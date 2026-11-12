"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { safeNextPath } from "@/lib/safe-internal-path";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import AppleLoginButton from "@/components/auth/AppleLoginButton";
import { requestBack } from "@/lib/app-shell/nav-direction";

/** ‹ 를 눌렀는데 이 시간 안에 기록 뒤로(popstate)가 안 오면 홈으로 — AppHeader 와 같은 값 */
const BACK_STUCK_MS = 400;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [checking, setChecking] = useState(true);

  // 이미 로그인 상태면 next 경로로 즉시 이동
  useEffect(() => {
    // open redirect 차단 — 서버 콜백과 동일하게 내부 path 만 허용
    const next = safeNextPath(sp.get("next"));
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.isAuthenticated) {
          router.replace(next);
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router, sp]);

  if (checking) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-14">별콩이가 너를 찾는 중이야…</p>
      </main>
    );
  }

  const next = safeNextPath(sp.get("next"));
  const kakaoHref = `/api/auth/login/kakao?next=${encodeURIComponent(next)}`;
  // 계측용 — 어느 로그인 벽에서 왔는지(next 가 없으면 safeNextPath 기본값 "/"). 경로 부분만 보낸다: 쿼리·해시엔 고민 원문·id 가 실릴 수 있다. 모양이 이상하거나 길면(id 가 든 경로 등) "other"
  const nextPath = next.split(/[?#]/)[0];
  const nextLabel = /^\/[A-Za-z0-9/_-]{0,40}$/.test(nextPath) ? nextPath : "other";

  // ‹ — 로그인 화면이 뜨기 전 화면으로. 돌아갈 기록이 없으면(이 주소로 바로 들어옴) 홈으로
  const goBack = () => {
    requestBack(window, () => router.back(), () => router.replace("/"), BACK_STUCK_MS);
  };

  // 그림·인사는 위쪽 가운데, 로그인 버튼 묶음은 화면 아래(엄지 쪽) · 나가기는 왼쪽 위 ‹ — 디자인 다듬기 ② /login 운영자 A안 11-12
  return (
    <main className="relative flex flex-1 flex-col items-center px-5 pt-6 pb-[max(env(safe-area-inset-bottom),28px)] max-w-md mx-auto w-full min-h-dvh animate-fade-in">
      <button
        type="button"
        onClick={goBack}
        aria-label="뒤로"
        className="absolute left-1 top-2 h-12 w-12 flex items-center justify-center text-eye-purple"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <div className="flex-1" aria-hidden />
      <div className="relative">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={200}
          height={200}
          priority
        />
      </div>

      <h1 className="mt-6 font-display text-22 text-eye-purple text-center">
        먼저 인사부터 할까?
      </h1>
      <p className="mt-3 text-14 text-text-light text-center leading-relaxed">
        로그인하면 너의 사주와 대화 기록이 안전하게 저장돼.
        <br />
        다음에 다시 와도 별콩이가 이어서 봐줄게.
      </p>
      <div className="flex-1" aria-hidden />

      <a
        href={kakaoHref}
        onClick={() => trackUiEvent("login_kakao_clicked", { meta: { surface: "login_page", next: nextLabel } })}
        className="mt-6 w-full flex items-center justify-center gap-2 h-13 rounded-xl bg-[#FEE500] text-[#3C1E1E] font-bold text-15 hover:brightness-95 active:scale-[0.98] transition"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.8L5.4 22l4.6-2.5c.7.1 1.4.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
        </svg>
        카카오로 계속하기
      </a>
      <AppleLoginButton next={next} surface="login_page" meta={{ next: nextLabel }} className="mt-2.5" />

      <p className="mt-4 text-11 text-text-light text-center leading-relaxed">
        시작하면{" "}
        <Link href="/terms" className="underline">
          이용약관
        </Link>
        과{" "}
        <Link href="/privacy" className="underline">
          개인정보처리방침
        </Link>
        에 동의한 것으로 간주돼.
      </p>
    </main>
  );
}
