"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  LOVE_TAGS,
  OTHER_TAGS,
  type EmotionTag,
} from "@/lib/emotions";
import { FORTUNE_CONFIG, fortuneTypeFromTag } from "@/lib/fortune/types";
import Footer from "@/components/layout/Footer";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

export default function Home() {
  const router = useRouter();
  const [hasResumable, setHasResumable] = useState(false);
  const [welcomeNudge, setWelcomeNudge] = useState(false);

  // 이어할 수 있는 (미종료) 타로 대화가 있는지 확인 → 상단 배너 노출.
  // AuthBootstrap 이 세션 sync 를 마치면(byeolkong:user-updated) 재계산 —
  // 로그인 직후 새로고침 없이 배너가 따라오게.
  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetch("/api/readings", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);
        const readings = (list?.readings ?? []) as Array<{
          consultationType?: string;
          emotionTag?: string | null;
          ended?: boolean;
        }>;
        const resumable = readings.some(
          (r) =>
            r.consultationType === "tarot" &&
            !fortuneTypeFromTag(r.emotionTag ?? null) &&
            r.ended === false
        );
        setHasResumable(resumable);

        // 웰컴 넛지: 로그인했는데 리딩이 하나도 없는 유저 (광고 가입 후 이탈 재방문 등)
        let loggedIn = false;
        try {
          const raw = localStorage.getItem("byeolkong_user");
          loggedIn = !!(raw && JSON.parse(raw));
        } catch {
          loggedIn = false;
        }
        setWelcomeNudge(loggedIn && list !== null && readings.length === 0);
      } catch {
        // noop
      }
    };
    void load();
    const onUserUpdated = () => void load();
    window.addEventListener("byeolkong:user-updated", onUserUpdated);
    return () =>
      window.removeEventListener("byeolkong:user-updated", onUserUpdated);
  }, []);

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
    LOVE_TAGS.includes(o.tag)
  );
  const normalOptions = EMOTION_OPTIONS.filter((o) =>
    OTHER_TAGS.includes(o.tag)
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

          <div className="max-w-md mx-auto px-5 pt-16 pb-12 relative z-10 animate-fade-in flex flex-col items-center">
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
              안녕! 나는 별콩이야
              <br />
              편하게 이야기 나누자
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
                궁금한 고민을 나에게 말해봐!
              </p>
              <p className="text-lilac-deep text-[14px] mt-0.5 font-extrabold">
                오늘 너의 마음은 어떤 흐름일까?
              </p>
            </div>
          </div>
        </div>

        {/* ━━━ 고민 카테고리 ━━━ */}
        <section
          id="emotion-grid"
          className="w-full max-w-md mx-auto px-4 pt-7 pb-8 relative z-10"
        >
          {welcomeNudge && (
            <button
              onClick={() =>
                document
                  .getElementById("emotion-grid")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="w-full flex items-center gap-3 mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-gold-soft/80 to-gold/50 border border-gold/50 text-left shadow-[0_4px_18px_rgba(232,194,106,0.25)] animate-fade-in"
            >
              <span className="text-[20px] shrink-0">⭐</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-eye-purple leading-tight">
                  웰컴 별 {WELCOME_BONUS_STARS}개가 기다리고 있어
                </p>
                <p className="text-[11.5px] text-eye-purple/75 mt-0.5 leading-tight">
                  아래에서 첫 고민을 골라봐 · 운세 리포트는 하단 사주
                  탭에서!
                </p>
              </div>
              <span className="text-eye-purple/60 text-[16px] shrink-0">↓</span>
            </button>
          )}
          {hasResumable && (
            <Link
              href="/readings"
              className="flex items-center gap-3 mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-lilac-deep to-eye-purple text-white shadow-[0_4px_18px_rgba(90,62,140,0.18)] animate-fade-in"
            >
              <span className="text-[20px] shrink-0">💬</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold leading-tight">
                  이어서 나눌 수 있는 대화가 있어
                </p>
                <p className="text-[11.5px] text-white/80 mt-0.5 leading-tight">
                  내 고민톡에서 별콩이와 다시 이야기해볼까?
                </p>
              </div>
              <span className="text-white/70 text-[16px] shrink-0">›</span>
            </Link>
          )}
          <div
            className="mb-6 p-4 rounded-2xl border border-lilac/40 shadow-[0_4px_18px_rgba(90,62,140,0.08)]"
            style={{
              background:
                "linear-gradient(135deg, #F6EFFF 0%, #EFE6FB 50%, #FBEFF4 100%)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[14px] leading-none" aria-hidden>
                💡
              </span>
              <span className="text-[12px] font-extrabold text-lilac-deep tracking-wide">
                이렇게 사용해요
              </span>
            </div>
            <p className="text-[12.5px] text-text-light leading-relaxed">
              고민을 입력하면 별콩이가 타로를 기반으로 고민 상담을 해줄거예요.
              말하기 어려운 고민도 괜찮아요. 별빛처럼 마음의 흐름을 읽어줄게요.
            </p>
          </div>

          <p className="text-[15px] text-eye-purple font-bold mb-3 px-1 flex items-center gap-1.5">
            <span className="text-[12px]" style={{ color: "#E48BA0" }}>♥</span> 연애 고민
          </p>

          {/* 연애 고민 (LOVE_TAGS 6개) */}
          <div className="flex flex-col gap-3 mb-4">
            {highlightOptions.map((option) => {
              const gradient = EMOTION_GRADIENTS[option.tag];
              return (
                <button
                  key={option.tag}
                  onClick={() => handleSelect(option.tag)}
                  className="flex items-center gap-3.5 p-4 bg-white/90 backdrop-blur-sm rounded-2xl border-2 border-lilac/40 hover:border-lilac-deep/40 transition-all text-left group"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={{ background: gradient }}
                  >
                    <Image
                      src={option.icon}
                      alt=""
                      width={48}
                      height={48}
                      className="object-contain group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-eye-purple text-[16px]">
                      {option.tag}
                    </p>
                    <p className="text-[12.5px] text-text-light mt-0.5 leading-relaxed">
                      {option.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {option.hashtags.map((h) => (
                        <span
                          key={h}
                          className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
                        >
                          #{h}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 디바이더 — 연애 고민(타로) ↔ 궁합(사주) 경계 */}
          <div className="flex items-center gap-3 mb-4" aria-hidden>
            <span className="flex-1 h-px bg-lilac-mid/40" />
            <span className="text-gold text-[11px]">✦</span>
            <span className="flex-1 h-px bg-lilac-mid/40" />
          </div>

          {/* 궁합 크로스링크 — 연애 카드와 동일 골격 + 사주 강조 */}
          <Link
            href="/fortune/compat"
            className="flex items-center gap-3.5 p-4 mb-6 bg-white/90 backdrop-blur-sm rounded-2xl border-2 border-gold/50 hover:border-gold transition-all text-left group"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #FFF3D6 0%, #F2D78A 100%)",
              }}
            >
              <span className="text-[32px] group-hover:scale-110 transition-transform" aria-hidden>
                💞
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-eye-purple text-[16px] flex items-center gap-1.5">
                우리 사주 연애 궁합은 어떨까?
                <span className="text-[11px] font-bold text-text-light">
                  ⭐ {FORTUNE_CONFIG.compat.cost}별
                </span>
              </p>
              <p className="text-[12.5px] text-text-light mt-0.5 leading-relaxed">
                두 사람 생년월일로 사주 궁합 보기
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {["궁합", "사주", "두사람"].map((h) => (
                  <span
                    key={h}
                    className="text-[11px] font-bold text-eye-purple bg-gold-soft/40 px-2 py-0.5 rounded-full"
                  >
                    #{h}
                  </span>
                ))}
              </div>
            </div>
          </Link>

          {/* 다른 고민 */}
          <p className="text-[15px] text-eye-purple font-bold mb-3 px-1 flex items-center gap-1.5">
            <span className="text-gold text-[12px]">✦</span> 다른 고민
          </p>

          <div className="flex flex-col gap-3 mb-3">
            {normalOptions.map((option) => {
              const gradient = EMOTION_GRADIENTS[option.tag];
              return (
                <button
                  key={option.tag}
                  onClick={() => handleSelect(option.tag)}
                  className="flex items-center gap-3.5 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition-all text-left group"
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={{ background: gradient }}
                  >
                    <Image
                      src={option.icon}
                      alt=""
                      width={42}
                      height={42}
                      className="object-contain group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-eye-purple text-[15px] leading-snug">
                      {option.tag}
                    </p>
                    <p className="text-[12px] text-text-light mt-0.5 leading-relaxed">
                      {option.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {option.hashtags.map((h) => (
                        <span
                          key={h}
                          className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
                        >
                          #{h}
                        </span>
                      ))}
                    </div>
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
