"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  EMOTION_SHORT_LABELS,
  LOVE_TAGS,
  OTHER_TAGS,
  type EmotionTag,
} from "@/lib/emotions";
import { FORTUNE_CONFIG, fortuneTypeFromTag } from "@/lib/fortune/types";
import Footer from "@/components/layout/Footer";
import HeroCarousel from "@/components/common/HeroCarousel";
import { type Audience, resolveAudience } from "@/components/common/hero-cards";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

export default function Home() {
  const router = useRouter();
  const [hasResumable, setHasResumable] = useState(false);
  const [welcomeNudge, setWelcomeNudge] = useState(false);
  const [audience, setAudience] = useState<Audience | null>(null);

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
        // 캐러셀 관객 판정: 비로그인=anon / 로그인+이력0=new / 로그인+이력=returning / 로그인+판정불가=null(로딩 기본).
        const hasReadings = list !== null ? readings.length > 0 : null;
        setAudience(resolveAudience(loggedIn, hasReadings));
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
        {/* ━━━ 히어로 캐러셀 (관객별 카드 필터 · 5초 자동 넘김 · 좌우 화살표 · 도트) ━━━ */}
        <HeroCarousel audience={audience} />

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

          <p className="text-[15px] text-eye-purple font-bold mb-3 px-1 flex items-center gap-1.5">
            <span className="text-[12px]" style={{ color: "#E48BA0" }}>♥</span> 연애 고민
          </p>

          {/* 연애 고민 — A: 인기 2개(제목+설명+해시태그) / B: 나머지 4개(2열 세로형) */}
          <div className="flex flex-col gap-2.5 mb-3">
            {highlightOptions.slice(0, 2).map((option) => {
              const gradient = EMOTION_GRADIENTS[option.tag];
              return (
                <button
                  key={option.tag}
                  onClick={() => handleSelect(option.tag)}
                  className="flex items-center gap-3.5 p-3.5 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition-all text-left group"
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
                    <p className="font-bold text-eye-purple text-[16px]">
                      {option.tag}
                    </p>
                    <p className="text-[12px] text-text-light mt-0.5 leading-snug">
                      {option.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {option.hashtags.slice(0, 3).map((h) => (
                        <span
                          key={h}
                          className="text-[10.5px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
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
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {highlightOptions.slice(2).map((option) => {
              const gradient = EMOTION_GRADIENTS[option.tag];
              const label = EMOTION_SHORT_LABELS[option.tag] ?? option.tag;
              return (
                <button
                  key={option.tag}
                  onClick={() => handleSelect(option.tag)}
                  className="flex items-center gap-2.5 p-3 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition-all text-left group"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={{ background: gradient }}
                  >
                    <Image
                      src={option.icon}
                      alt=""
                      width={32}
                      height={32}
                      className="object-contain group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-eye-purple text-[13.5px] leading-tight truncate">
                      {label}
                    </p>
                    <p className="mt-[3px] text-[11px] font-bold text-lilac-deep truncate">
                      #{option.hashtags[0]}
                      {option.hashtags[1] ? ` · ${option.hashtags[1]}` : ""}
                    </p>
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

          {/* 궁합 크로스링크 — A 카드 골격 + 사주 골드 강조 */}
          <Link
            href="/fortune/compat"
            className="flex items-center gap-3.5 p-3.5 mb-5 bg-white rounded-2xl border border-gold/60 hover:border-gold transition-all text-left group"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #FFF3D6 0%, #F2D78A 100%)",
              }}
            >
              <span className="text-[28px] group-hover:scale-110 transition-transform" aria-hidden>
                💞
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-eye-purple text-[15px] flex items-center gap-1.5">
                우리의 사주 궁합은?
                <span className="text-[11px] font-bold text-text-light">
                  ⭐ {FORTUNE_CONFIG.compat.cost}별
                </span>
              </p>
              <p className="text-[12px] text-text-light mt-0.5 leading-snug">
                두 사람 생년월일로 사주 궁합 보기
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {["궁합", "사주", "두사람"].map((h) => (
                  <span
                    key={h}
                    className="text-[10.5px] font-bold text-eye-purple bg-gold-soft/40 px-2 py-0.5 rounded-full"
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

          <div className="grid grid-cols-2 gap-2.5 mb-3">
            {normalOptions.map((option) => {
              const gradient = EMOTION_GRADIENTS[option.tag];
              const label = EMOTION_SHORT_LABELS[option.tag] ?? option.tag;
              return (
                <button
                  key={option.tag}
                  onClick={() => handleSelect(option.tag)}
                  className="flex items-center gap-2.5 p-3 bg-white/80 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition-all text-left group"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={{ background: gradient }}
                  >
                    <Image
                      src={option.icon}
                      alt=""
                      width={32}
                      height={32}
                      className="object-contain group-hover:scale-110 transition-transform"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-eye-purple text-[13.5px] leading-tight truncate">
                      {label}
                    </p>
                    <p className="mt-[3px] text-[11px] font-bold text-lilac-deep truncate">
                      #{option.hashtags[0]}
                      {option.hashtags[1] ? ` · ${option.hashtags[1]}` : ""}
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
