"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import Footer from "@/components/layout/Footer";
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  HIGHLIGHT_TAGS,
  NORMAL_TAGS,
  type EmotionTag,
} from "@/lib/emotions";

export default function Home() {
  const router = useRouter();

  const handleSelect = (tag: EmotionTag) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("byeolkong:emotion", tag);
    }

    // 로그인 가드: 카카오 로그인 유저만 진행. 비로그인은 /login 으로.
    const raw =
      typeof window !== "undefined"
        ? localStorage.getItem("byeolkong_user")
        : null;
    let user: { provider?: string } | null = null;
    try {
      user = raw ? JSON.parse(raw) : null;
    } catch {
      user = null;
    }
    if (!user) {
      router.push(`/login?next=${encodeURIComponent("/concern")}`);
      return;
    }
    router.push("/concern");
  };

  const highlightOptions = EMOTION_OPTIONS.filter((o) =>
    HIGHLIGHT_TAGS.includes(o.tag)
  );
  const normalOptions = EMOTION_OPTIONS.filter((o) =>
    NORMAL_TAGS.includes(o.tag)
  );

  return (
    <>
      <div className="flex flex-col items-center relative w-full max-w-md mx-auto">
        {/* ━━━ 히어로 ━━━ */}
        <section
          className="w-full relative overflow-hidden rounded-b-3xl"
          style={{
            background:
              "linear-gradient(180deg, #16122E 0%, #241C49 40%, #382C6B 75%, #4A3A82 100%)",
          }}
        >
          {/* 별 파티클 */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute top-[8%] left-[18%] w-2 h-2 bg-gold rounded-full animate-star-twinkle" />
            <div
              className="absolute top-[14%] right-[14%] w-1.5 h-1.5 bg-gold-soft rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.4s" }}
            />
            <div
              className="absolute top-[34%] left-[8%] w-1 h-1 bg-white rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.8s" }}
            />
            <div
              className="absolute top-[24%] right-[9%] w-1 h-1 bg-gold-soft rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.2s" }}
            />
            <div
              className="absolute top-[58%] right-[22%] w-1.5 h-1.5 bg-gold rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.6s" }}
            />
            <div
              className="absolute top-[12%] left-[44%] w-1 h-1 bg-white rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.6s" }}
            />
            <div
              className="absolute top-[20%] left-[30%] w-1.5 h-1.5 bg-white/90 rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.2s" }}
            />
            <div
              className="absolute top-[46%] right-[12%] w-1 h-1 bg-gold rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.0s" }}
            />
            <div
              className="absolute top-[52%] left-[14%] w-1 h-1 bg-gold-soft rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.4s" }}
            />
            <div
              className="absolute top-[70%] left-[26%] w-1 h-1 bg-white rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.5s" }}
            />
            <div
              className="absolute top-[40%] left-[50%] w-1 h-1 bg-white/80 rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.8s" }}
            />
            <div
              className="absolute top-[66%] right-[16%] w-1.5 h-1.5 bg-gold-soft rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.9s" }}
            />
            <div
              className="absolute top-[30%] right-[30%] w-1 h-1 bg-white rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.3s" }}
            />
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-lilac/20 rounded-full blur-3xl" />
            <div className="absolute top-1/3 -left-16 w-48 h-48 bg-gold/10 rounded-full blur-3xl" />
          </div>

          <div className="max-w-md mx-auto px-5 pt-10 pb-12 relative z-10 animate-fade-in flex flex-col items-center">
            <div className="relative w-[180px] h-[180px] mb-3 animate-float">
              <Image
                src="/byeolkong-hero.png"
                alt="별콩이"
                fill
                sizes="180px"
                priority
                className="relative object-contain drop-shadow-lg"
              />
            </div>

            <h1
              className="font-display text-[28px] text-white leading-snug tracking-wide text-center"
              style={{ textShadow: "0 2px 16px rgba(120,90,200,0.55)" }}
            >
              너를 기다리고 있었어.
              <br />
              편하게 앉아서 이야기해
            </h1>
          </div>
        </section>

        {/* ━━━ 말풍선 ━━━ */}
        <div className="w-full max-w-md mx-auto px-5 -mt-6 relative z-10">
          <div className="relative w-full max-w-[320px] mx-auto">
            <div
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 z-0"
              style={{ boxShadow: "0 -2px 8px rgba(90,62,140,0.06)" }}
            />
            <div
              className="relative z-10 bg-white rounded-2xl px-6 py-3.5 text-center"
              style={{ boxShadow: "0 4px 20px rgba(90,62,140,0.08)" }}
            >
              <p className="text-eye-purple text-[14px] font-medium">
                궁금한거나 고민을 나에게 말해봐!
              </p>
              <p className="text-lilac-deep text-[14px] mt-0.5 font-extrabold">
                오늘 너의 마음은 어떤 흐름일까?
              </p>
            </div>
          </div>
        </div>

        {/* ━━━ 고민 카테고리 ━━━ */}
        <section className="w-full max-w-md mx-auto px-5 pt-7 pb-8 relative z-10">
          <div className="flex items-start gap-2.5 mb-6 px-4 py-3.5 rounded-2xl bg-lilac-soft/40 border border-lilac/30">
            <span className="text-[15px] leading-none mt-0.5" aria-hidden>
              💡
            </span>
            <p className="text-[12.5px] text-text-light leading-relaxed">
              고민을 입력하면 별콩이가 타로나 사주 같은 운세를 기반으로 고민
              상담을 해줄거예요. 말하기 어려운 고민도 괜찮아요. 별빛처럼
              조심스럽게 마음의 흐름을 읽어줄게요.
            </p>
          </div>

          <p className="text-[15px] text-eye-purple font-bold mb-3 px-1 flex items-center gap-1.5">
            <span className="text-[12px]" style={{ color: "#E48BA0" }}>♥</span> 인기 고민
          </p>

          {/* 상단 하이라이트 2개 */}
          <div className="flex flex-col gap-2 mb-6">
            {highlightOptions.map((option) => {
              const gradient = EMOTION_GRADIENTS[option.tag];
              return (
                <button
                  key={option.tag}
                  onClick={() => handleSelect(option.tag)}
                  className="flex items-center gap-4 p-4 bg-white/90 backdrop-blur-sm rounded-2xl border-2 border-lilac/40 hover:border-lilac-deep/40 transition-all text-left group"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: gradient }}
                  >
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      {option.emoji}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-eye-purple text-[16px]">
                      {option.tag}
                    </p>
                    <p className="text-[13px] text-text-light mt-0.5 leading-relaxed">
                      {option.description}
                    </p>
                    <p className="text-[12px] font-bold mt-2 leading-snug">
                      <span className="text-lilac-deep">사주</span>
                      <span className="text-text-light/40 mx-1">·</span>
                      <span className="text-gold">타로</span>
                    </p>
                  </div>
                  <span className="text-lilac-deep/50 group-hover:text-lilac-deep transition-colors text-2xl font-bold">
                    ›
                  </span>
                </button>
              );
            })}
          </div>

          {/* 다른 고민 */}
          <p className="text-[15px] text-eye-purple font-bold mb-3 px-1 flex items-center gap-1.5">
            <span className="text-gold text-[12px]">✦</span> 다른 고민
          </p>

          <div className="grid grid-cols-2 gap-2.5 mb-3">
            {normalOptions.map((option) => {
              const gradient = EMOTION_GRADIENTS[option.tag];
              return (
                <button
                  key={option.tag}
                  onClick={() => handleSelect(option.tag)}
                  className="flex flex-col items-start gap-2.5 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition-all text-left group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: gradient }}
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform">
                      {option.emoji}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-eye-purple text-[15px] leading-snug">
                      {option.tag}
                    </p>
                    <p className="text-[12px] text-text-light mt-0.5 leading-relaxed">
                      {option.description}
                    </p>
                    <p className="text-[11px] font-bold mt-2 leading-snug whitespace-nowrap">
                      <span className="text-lilac-deep">사주</span>
                      <span className="text-text-light/40 mx-0.5">·</span>
                      <span className="text-gold">타로</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <Footer />
    </>
  );
}
