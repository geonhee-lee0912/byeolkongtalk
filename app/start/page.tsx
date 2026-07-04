"use client";

// 광고 전용 랜딩 — utm_content(counsel|daily|tarot)별 메뉴만 노출.
// 유효 utm_content 없이 직접 진입하면 홈으로 (오가닉 유저는 이 페이지를 모르게).
// 선택 → (비로그인) 카카오 로그인 → 웰컴 팝업 → 기존 흐름 핸드오프.

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

const VARIANTS = ["counsel", "daily", "tarot"] as const;
type Variant = (typeof VARIANTS)[number];

const HERO_COPY: Record<Variant, { line1: string; line2: string }> = {
  counsel: { line1: "요즘 마음 복잡하지?", line2: "별콩이가 들어줄게" },
  daily: { line1: "오늘 하루,", line2: "어떤 흐름일까?" },
  tarot: { line1: "카드는 네가", line2: "직접 뽑아" },
};

function isVariant(v: string | null): v is Variant {
  return VARIANTS.includes(v as Variant);
}

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartPageInner />
    </Suspense>
  );
}

function StartPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const variant = sp.get("utm_content");
  const valid = isVariant(variant);

  // 광고 전용 가드 — 유효 utm_content 없으면 홈으로
  useEffect(() => {
    if (!valid) router.replace("/");
  }, [valid, router]);

  if (!valid) return null;
  const heroCopy = HERO_COPY[variant];

  return (
    <main className="min-h-dvh w-full flex flex-col items-center animate-fade-in">
      {/* 다크 히어로 — 광고 카피 매칭 */}
      <section
        className="w-full"
        style={{
          background:
            "linear-gradient(180deg, #16122E 0%, #241C49 45%, #4A3A82 100%)",
        }}
      >
        <div className="max-w-md mx-auto px-5 pt-12 pb-8 flex flex-col items-center">
          <div className="relative w-[120px] h-[120px] mb-3 animate-float">
            <Image
              src="/byeolkong-hero.png"
              alt="별콩이"
              fill
              sizes="120px"
              priority
              className="object-contain drop-shadow-lg"
            />
          </div>
          <h1
            className="font-display text-[26px] text-white leading-snug text-center"
            style={{ textShadow: "0 2px 16px rgba(120,90,200,0.55)" }}
          >
            {heroCopy.line1}
            <br />
            {heroCopy.line2}
          </h1>
        </div>
      </section>

      {/* 골드 리본 — "무료" 약속 없이 웰컴 별만 */}
      <div className="w-full bg-gold-soft/90 py-2.5 text-center">
        <p className="text-[13px] font-extrabold text-eye-purple">
          지금 가입하면 웰컴 별 {WELCOME_BONUS_STARS}개 ✨
        </p>
      </div>

      {/* 서비스 메뉴 — Task 2 에서 채움 */}
      <section className="w-full max-w-md mx-auto px-5 py-6 flex flex-col gap-3" />
    </main>
  );
}
