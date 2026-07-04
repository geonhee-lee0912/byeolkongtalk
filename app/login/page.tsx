"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

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
    const rawNext = sp.get("next") || "/";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
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
        <p className="text-text-light text-sm">별콩이가 너를 찾는 중이야…</p>
      </main>
    );
  }

  const next = sp.get("next") || "/";
  const kakaoHref = `/api/auth/login/kakao?next=${encodeURIComponent(next)}`;

  return (
    <main className="flex flex-1 flex-col items-center px-5 py-12 max-w-md mx-auto w-full animate-fade-in">
      <div className="relative animate-float">
        <Image
          src="/byeolkong-main.png"
          alt="별콩이"
          width={200}
          height={200}
          priority
        />
        <div className="absolute -top-1 left-4 w-2.5 h-2.5 bg-gold rounded-full animate-star-twinkle" />
        <div
          className="absolute top-10 -right-1 w-2 h-2 bg-gold-soft rounded-full animate-star-twinkle"
          style={{ animationDelay: "0.6s" }}
        />
      </div>

      <h1 className="mt-6 text-2xl font-bold text-eye-purple text-center">
        먼저 인사부터 할까?
      </h1>
      <p className="mt-3 text-sm text-text-light text-center leading-relaxed">
        로그인하면 너의 사주와 대화 기록이 안전하게 저장돼.
        <br />
        다음에 다시 와도 별콩이가 이어서 봐줄게.
      </p>

      <a
        href={kakaoHref}
        className="mt-10 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#FEE500] text-[#3C1E1E] font-bold text-[15px] hover:brightness-95 active:scale-[0.98] transition"
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
        카카오로 시작하기
      </a>

      <p className="mt-4 text-[11px] text-text-light/70 text-center leading-relaxed">
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

      <Link
        href="/"
        className="mt-8 text-[13px] text-text-light/80 underline"
      >
        나중에 할래
      </Link>
    </main>
  );
}
