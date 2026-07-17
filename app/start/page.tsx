"use client";

// 광고 전용 랜딩 — utm_content(counsel|daily|tarot)별 메뉴만 노출.
// 유효 utm_content 없이 직접 진입하면 홈으로 (오가닉 유저는 이 페이지를 모르게).
// 선택 → (비로그인) 카카오 로그인 → 웰컴 팝업 → 기존 흐름 핸드오프.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { WELCOME_BONUS_STARS } from "@/lib/constants";
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  LOVE_TAGS,
  type EmotionTag,
  type EmotionOption,
} from "@/lib/emotions";
import {
  FORTUNE_CONFIG,
  FORTUNE_LIST,
  FORTUNE_GRADIENTS,
  type FortuneConfig,
} from "@/lib/fortune/types";
import WelcomeStarsModal from "@/components/start/WelcomeStarsModal";

const VARIANTS = ["counsel", "daily", "tarot", "reunion", "contact"] as const;
type Variant = (typeof VARIANTS)[number];

const HERO_COPY: Record<Variant, { line1: string; line2: string }> = {
  counsel: { line1: "요즘 마음 복잡하지?", line2: "별콩이가 들어줄게" },
  daily: { line1: "오늘 하루,", line2: "어떤 흐름일까?" },
  tarot: { line1: "카드는 네가", line2: "직접 뽑아" },
  reunion: { line1: "헤어진 그 사람,", line2: "아직 나를 생각할까?" },
  contact: { line1: "핸드폰만 보고 있는", line2: "너에게" },
};

/** 연애 직행 variant → 하이라이트 태그 */
const LOVE_VARIANT_TAG: Partial<Record<Variant, EmotionTag>> = {
  reunion: "재회할 수 있을까",
  contact: "언제 연락 올까, 타이밍이 궁금해",
};

// daily variant: 광고가 약속한 "오늘의 운세"를 맨 위로 (별콩 운세 10종 전체)
const DAILY_ORDERED: FortuneConfig[] = [
  FORTUNE_CONFIG.daily,
  ...FORTUNE_LIST.filter((f) => f.type !== "daily"),
];

// 연애 존 태그만 (EMOTION_OPTIONS 순서 유지)
const LOVE_OPTIONS: EmotionOption[] = EMOTION_OPTIONS.filter((o) =>
  LOVE_TAGS.includes(o.tag)
);

function isVariant(v: string | null): v is Variant {
  return VARIANTS.includes(v as Variant);
}

const START_PENDING_KEY = "byeolkong:start_pending";

type StartPending =
  | { kind: "emotion"; tag: EmotionTag }
  | { kind: "fortune"; href: string };

function readPending(): StartPending | null {
  try {
    const raw = sessionStorage.getItem(START_PENDING_KEY);
    return raw ? (JSON.parse(raw) as StartPending) : null;
  } catch {
    return null;
  }
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

  // 핸드오프: 저장된 선택을 기존 흐름으로. router.push(소프트) 라 브라우저 백 = /start
  // 복귀. 하드 내비게이션 금지 — 로그인 콜백 직후엔 AuthBootstrap 의 세션 sync fetch 가
  // 진행 중이라 풀 페이지 이동이 sync 를 죽여 앱 전체가 비로그인으로 고착된다.
  // (AuthBootstrap 의 URL 정리 replace 는 /start 예외로 스킵되므로 push 레이스 없음)
  const proceed = (pending: StartPending) => {
    try {
      sessionStorage.removeItem(START_PENDING_KEY);
    } catch {}
    if (pending.kind === "emotion") {
      try {
        sessionStorage.setItem("byeolkong:emotion", pending.tag);
      } catch {}
      router.push("/concern");
    } else if (
      // sessionStorage 위조/파손 방어 — 내부 path 만 push
      typeof pending.href === "string" &&
      pending.href.startsWith("/") &&
      !pending.href.startsWith("//")
    ) {
      router.push(pending.href);
    }
  };

  const handleSelect = (pending: StartPending) => {
    try {
      sessionStorage.setItem(START_PENDING_KEY, JSON.stringify(pending));
    } catch {}
    // 로그인 판정은 loggedIn state 재사용 (login=success + AuthBootstrap sync 반영).
    // 미판정(null)이면 보수적으로 로그인 페이지로 — 세션 있으면 즉시 복귀한다.
    if (loggedIn !== true) {
      router.push(
        `/login?next=${encodeURIComponent(`/start?${sp.toString()}`)}`
      );
      return;
    }
    proceed(pending);
  };

  // 타로 갈래 스텝: branch(2택) → counsel(감정 10종) | fortune(타로 운세 5종)
  const [tarotStep, setTarotStep] = useState<"branch" | "counsel" | "fortune">(
    "branch"
  );
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // 가입 유도 박스 노출 판정 — 로그인 유저에겐 "지금 가입하면" 이 어긋나니 숨김.
  // localStorage 는 AuthBootstrap 이 비동기로 sync 하므로 마운트 시점 값만 믿으면
  // 로그인 직후 복귀에서 오판한다 — login=success 는 즉시 로그인 취급 + sync 이벤트 구독.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem("byeolkong_user");
        setLoggedIn(!!(raw && JSON.parse(raw)));
      } catch {
        setLoggedIn(false);
      }
    };
    if (sp.get("login") === "success") {
      setLoggedIn(true); // 카카오 콜백 복귀 — 세션 쿠키가 방금 생김
    } else {
      check();
    }
    // AuthBootstrap 이 서버 세션 ↔ localStorage sync 를 마치면 재판정
    window.addEventListener("byeolkong:user-updated", check);
    return () => window.removeEventListener("byeolkong:user-updated", check);
    // 마운트 1회 + 이벤트 구독 (sp 는 초기값만 필요)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로그인 복귀: 신규가입(welcome=1)이면 팝업, 기존 유저면 pending 바로 진행
  useEffect(() => {
    if (!valid) return;
    if (sp.get("login") !== "success") return;
    if (sp.get("welcome") === "1") {
      setWelcomeOpen(true);
      return;
    }
    const pending = readPending();
    if (pending) {
      proceed(pending);
      return;
    }
    // 진행할 선택이 없으면(가입 박스 직행 등) 본체 홈으로 보낸다 — 광고 랜딩에 고이지 않게.
    router.push("/");
    // 마운트 1회 판정 (로그인 복귀는 항상 fresh mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  const handleWelcomeClose = () => {
    setWelcomeOpen(false);
    // 새로고침/뒤로가기 시 팝업 재노출 방지 — login/welcome 파라미터만 제거 (utm 유지).
    // router.replace 는 바로 뒤 proceed 의 push 에 밀려 히스토리에 안 남으므로,
    // 네이티브 replaceState 로 현재 엔트리를 동기 정리한다.
    const clean = new URLSearchParams(sp.toString());
    clean.delete("login");
    clean.delete("welcome");
    window.history.replaceState(null, "", `/start?${clean.toString()}`);
    const pending = readPending();
    if (pending) proceed(pending);
    else router.push("/"); // 선택 없이 가입 → 본체 홈으로
  };

  // variant 가 바뀌면(이례적 — 쿼리만 바뀌는 내비게이션) 갈래 스텝 초기화
  useEffect(() => {
    setTarotStep("branch");
  }, [variant]);

  if (!valid) return null;
  const heroCopy = HERO_COPY[variant];

  return (
    <main className="min-h-dvh w-full flex flex-col items-center animate-fade-in">
      <div className="w-full max-w-md mx-auto flex flex-col">
        {/* 다크 히어로 — 광고 카피 매칭 (홈처럼 max-w-md 안 + 둥근 하단) */}
        <section
          className="relative w-full overflow-hidden rounded-b-3xl"
          style={{
            background:
              "linear-gradient(180deg, #16122E 0%, #241C49 45%, #4A3A82 100%)",
          }}
        >
          {/* 별 파티클 */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute top-[10%] left-[16%] w-2 h-2 bg-gold rounded-full animate-star-twinkle" />
            <div
              className="absolute top-[18%] right-[14%] w-1.5 h-1.5 bg-gold-soft rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.4s" }}
            />
            <div
              className="absolute top-[34%] left-[9%] w-1 h-1 bg-white rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.8s" }}
            />
            <div
              className="absolute top-[26%] right-[26%] w-1 h-1 bg-gold-soft rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.2s" }}
            />
            <div
              className="absolute top-[56%] right-[12%] w-1.5 h-1.5 bg-gold rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.6s" }}
            />
            <div
              className="absolute top-[14%] left-[42%] w-1 h-1 bg-white rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.6s" }}
            />
            <div
              className="absolute top-[48%] left-[20%] w-1 h-1 bg-gold-soft rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.0s" }}
            />
            <div
              className="absolute top-[64%] left-[38%] w-1 h-1 bg-white/80 rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.2s" }}
            />
            <div className="absolute -top-10 -right-10 w-44 h-44 bg-lilac/20 rounded-full blur-3xl" />
            <div className="absolute top-1/2 -left-12 w-40 h-40 bg-gold/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 px-5 pt-12 pb-8 flex flex-col items-center">
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

        {/* 가입 유도 박스 — 웰컴 별 안내 + 카카오 가입 (비로그인만) */}
        {loggedIn === false && (
          <div className="mx-5 mt-4 p-4 rounded-2xl bg-white/90 border border-gold/50 shadow-[0_4px_18px_rgba(232,194,106,0.25)] flex flex-col items-center gap-3">
            <p className="text-[14px] font-extrabold text-eye-purple">
              지금 가입하면 웰컴 별 {WELCOME_BONUS_STARS}개 ✨
            </p>
            <a
              href={`/api/auth/login/kakao?next=${encodeURIComponent(
                `/start?${sp.toString()}`
              )}`}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FEE500] text-[#3C1E1E] font-bold text-[14px] hover:brightness-95 active:scale-[0.98] transition"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.8L5.4 22l4.6-2.5c.7.1 1.4.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
              </svg>
              카카오로 3초만에 가입하고 별 받기
            </a>
          </div>
        )}

        {/* 본체 진입점 — 선택 없이도 앱 전체를 둘러볼 수 있게 (소프트 내비: 하단탭·헤더 있는 본체로) */}
        <div className="mx-5 mt-3">
          <button
            onClick={() => router.push("/")}
            className="block w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[13.5px] text-center hover:bg-lilac-deep/5 active:scale-[0.98] transition"
          >
            별콩톡 전체 보러가기 →
          </button>
        </div>

        {/* 서비스 메뉴 — variant 분기 */}
        <section className="w-full px-5 py-6 flex flex-col gap-3">
        {variant === "counsel" && (
          <>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              어떤 고민이야? 골라봐
            </p>
            <EmotionList
              onSelect={(tag) => handleSelect({ kind: "emotion", tag })}
            />
          </>
        )}

        {LOVE_VARIANT_TAG[variant] && (
          <LoveDirectMenu
            tag={LOVE_VARIANT_TAG[variant]!}
            onSelect={(tag) => handleSelect({ kind: "emotion", tag })}
            onOther={() => router.push("/")}
          />
        )}

        {variant === "daily" && (
          <>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              보고 싶은 운세 리포트를 골라봐
            </p>
            <FortuneMenuList
              items={DAILY_ORDERED}
              onSelect={(href) => handleSelect({ kind: "fortune", href })}
            />
          </>
        )}

        {variant === "tarot" && tarotStep === "branch" && (
          <>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              타로, 어떻게 볼까?
            </p>
            <button
              onClick={() => setTarotStep("counsel")}
              className="flex flex-col items-center gap-1.5 p-6 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
            >
              <span className="text-[28px]">🔮</span>
              <span className="text-[16px] font-bold text-eye-purple">
                타로로 고민 상담
              </span>
              <span className="text-[12px] text-text-light">
                별콩이와 대화하며 카드를 풀어가
              </span>
            </button>
            <button
              onClick={() => setTarotStep("fortune")}
              className="flex flex-col items-center gap-1.5 p-6 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
            >
              <span className="text-[28px]">🃏</span>
              <span className="text-[16px] font-bold text-eye-purple">
                타로 운세 보기
              </span>
              <span className="text-[12px] text-text-light">
                한 장의 리포트로 빠르게
              </span>
            </button>
          </>
        )}

        {variant === "tarot" && tarotStep === "counsel" && (
          <>
            <button
              onClick={() => setTarotStep("branch")}
              className="self-start text-[12px] text-text-light/80 px-1"
            >
              ‹ 다시 고르기
            </button>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              어떤 고민이야? 골라봐
            </p>
            <EmotionList
              onSelect={(tag) => handleSelect({ kind: "emotion", tag })}
            />
          </>
        )}

        {variant === "tarot" && tarotStep === "fortune" && (
          <>
            <button
              onClick={() => setTarotStep("branch")}
              className="self-start text-[12px] text-text-light/80 px-1"
            >
              ‹ 다시 고르기
            </button>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              어떤 연애 고민인지 골라봐
            </p>
            <EmotionList
              options={LOVE_OPTIONS}
              onSelect={(tag) => handleSelect({ kind: "emotion", tag })}
            />
          </>
        )}
        </section>
      </div>
      {welcomeOpen && <WelcomeStarsModal onStart={handleWelcomeClose} />}
    </main>
  );
}

/** reunion/contact 등 연애 직행 variant — 하이라이트 태그 + 나머지 연애 존 목록 */
function LoveDirectMenu({
  tag,
  onSelect,
  onOther,
}: {
  tag: EmotionTag;
  onSelect: (tag: EmotionTag) => void;
  onOther: () => void;
}) {
  const option = EMOTION_OPTIONS.find((o) => o.tag === tag);
  const otherOptions = LOVE_OPTIONS.filter((o) => o.tag !== tag);
  if (!option) return null;

  return (
    <>
      <div className="p-5 bg-white/95 rounded-2xl border-2 border-lilac-deep/50 shadow-[0_4px_20px_rgba(90,62,140,0.15)] flex flex-col items-center gap-3 text-center">
        <span
          className="text-[12px] font-bold px-3 py-1 rounded-full bg-[#E48BA0]/10"
          style={{ color: "#E48BA0" }}
        >
          네가 보고 온 그 고민
        </span>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
          style={{ background: EMOTION_GRADIENTS[tag] }}
        >
          <Image
            src={option.icon}
            alt=""
            width={48}
            height={48}
            className="object-contain"
          />
        </div>
        <p className="font-display text-[19px] text-eye-purple leading-snug">
          {tag}
        </p>
        <button
          onClick={() => onSelect(tag)}
          className="w-full mt-1 py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
        >
          별콩이한테 물어보기
        </button>
      </div>

      <p className="text-[13px] font-bold text-eye-purple px-1 mt-2">
        다른 연애 고민이라면
      </p>
      <EmotionList options={otherOptions} onSelect={onSelect} />

      <button
        onClick={onOther}
        className="text-[12.5px] text-text-light/80 hover:text-eye-purple transition text-center mt-1"
      >
        연애 말고 다른 고민이 있다면 →
      </button>
    </>
  );
}

function EmotionList({
  options = EMOTION_OPTIONS,
  onSelect,
}: {
  options?: EmotionOption[];
  onSelect: (tag: EmotionTag) => void;
}) {
  return (
    <>
      {options.map((option) => (
        <button
          key={option.tag}
          onClick={() => onSelect(option.tag)}
          className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition text-left"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: EMOTION_GRADIENTS[option.tag] }}
          >
            <Image
              src={option.icon}
              alt=""
              width={42}
              height={42}
              className="object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-eye-purple text-[15px] leading-snug">
              {option.tag}
            </p>
            <p className="text-[12px] text-text-light mt-0.5 leading-relaxed">
              {option.description}
            </p>
          </div>
        </button>
      ))}
    </>
  );
}

function FortuneMenuList({
  items,
  onSelect,
}: {
  items: FortuneConfig[];
  onSelect: (href: string) => void;
}) {
  return (
    <>
      {items.map((f) => {
        return (
          <button
            key={f.type}
            onClick={() => onSelect(f.href)}
            className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl text-left transition border border-lilac-soft hover:border-lilac-deep/40"
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
              style={{ background: FORTUNE_GRADIENTS[f.type] }}
            >
              {f.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[15px] font-bold text-eye-purple">
                  {f.label}
                </span>
                {f.cost > 0 && (
                  <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                    ⭐ {f.cost}
                  </span>
                )}
              </div>
              <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                {f.tagline}
              </p>
            </div>
          </button>
        );
      })}
    </>
  );
}

