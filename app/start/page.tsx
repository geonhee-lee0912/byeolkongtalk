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
  type EmotionTag,
} from "@/lib/emotions";
import {
  FORTUNE_CONFIG,
  FORTUNE_LIST,
  FORTUNE_GRADIENTS,
  type FortuneConfig,
} from "@/lib/fortune/types";
import WelcomeStarsModal from "@/components/start/WelcomeStarsModal";

const VARIANTS = ["counsel", "daily", "tarot"] as const;
type Variant = (typeof VARIANTS)[number];

const HERO_COPY: Record<Variant, { line1: string; line2: string }> = {
  counsel: { line1: "요즘 마음 복잡하지?", line2: "별콩이가 들어줄게" },
  daily: { line1: "오늘 하루,", line2: "어떤 흐름일까?" },
  tarot: { line1: "카드는 네가", line2: "직접 뽑아" },
};

// daily variant: 광고가 약속한 "오늘의 운세"를 맨 위로 (별콩 운세 10종 전체)
const DAILY_ORDERED: FortuneConfig[] = [
  FORTUNE_CONFIG.daily,
  ...FORTUNE_LIST.filter((f) => f.type !== "daily"),
];

const TAROT_FORTUNES: FortuneConfig[] = FORTUNE_LIST.filter(
  (f) => f.base === "tarot"
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

  // 핸드오프: 저장된 선택을 기존 흐름으로. router.push 라 브라우저 백 = /start 복귀
  const proceed = (pending: StartPending) => {
    try {
      sessionStorage.removeItem(START_PENDING_KEY);
    } catch {}
    if (pending.kind === "emotion") {
      try {
        sessionStorage.setItem("byeolkong:emotion", pending.tag);
      } catch {}
      router.push("/concern");
    } else {
      router.push(pending.href);
    }
  };

  const handleSelect = (pending: StartPending) => {
    try {
      sessionStorage.setItem(START_PENDING_KEY, JSON.stringify(pending));
    } catch {}
    // 홈과 동일한 로그인 가드 패턴 (localStorage byeolkong_user)
    let loggedIn = false;
    try {
      const raw = localStorage.getItem("byeolkong_user");
      loggedIn = !!(raw && JSON.parse(raw));
    } catch {
      loggedIn = false;
    }
    if (!loggedIn) {
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
  const [balance, setBalance] = useState<number | null>(null);

  // 로그인 복귀: 신규가입(welcome=1)이면 팝업, 기존 유저면 pending 바로 진행
  useEffect(() => {
    if (!valid) return;
    if (sp.get("login") !== "success") return;
    if (sp.get("welcome") === "1") {
      setWelcomeOpen(true);
      void fetch("/api/stars/balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) =>
          setBalance(typeof d?.balance === "number" ? d.balance : null)
        )
        .catch(() => {});
      return;
    }
    const pending = readPending();
    if (pending) proceed(pending);
    // 마운트 1회 판정 (로그인 복귀는 항상 fresh mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  const handleWelcomeClose = () => {
    setWelcomeOpen(false);
    // 새로고침 시 팝업 재노출 방지 — login/welcome 파라미터만 제거 (utm 유지)
    const clean = new URLSearchParams(sp.toString());
    clean.delete("login");
    clean.delete("welcome");
    router.replace(`/start?${clean.toString()}`);
    const pending = readPending();
    if (pending) proceed(pending);
  };

  // variant 가 바뀌면(이례적 — 쿼리만 바뀌는 내비게이션) 갈래 스텝 초기화
  useEffect(() => {
    setTarotStep("branch");
  }, [variant]);

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

      {/* 서비스 메뉴 — variant 분기 */}
      <section className="w-full max-w-md mx-auto px-5 py-6 flex flex-col gap-3">
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

        {variant === "daily" && (
          <>
            <p className="text-[13px] font-bold text-eye-purple px-1">
              보고 싶은 운세 리포트를 골라봐
            </p>
            <FortuneMenuList
              items={DAILY_ORDERED}
              highlightType="daily"
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
              보고 싶은 타로 운세를 골라봐
            </p>
            <FortuneMenuList
              items={TAROT_FORTUNES}
              onSelect={(href) => handleSelect({ kind: "fortune", href })}
            />
          </>
        )}
      </section>
      {welcomeOpen && (
        <WelcomeStarsModal balance={balance} onStart={handleWelcomeClose} />
      )}
    </main>
  );
}

function EmotionList({ onSelect }: { onSelect: (tag: EmotionTag) => void }) {
  return (
    <>
      {EMOTION_OPTIONS.map((option) => (
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
  highlightType,
  onSelect,
}: {
  items: FortuneConfig[];
  /** 이 type 카드에 "광고에서 본 그거" 뱃지 + 강조 보더 */
  highlightType?: string;
  onSelect: (href: string) => void;
}) {
  return (
    <>
      {items.map((f) => {
        const highlighted = f.type === highlightType;
        return (
          <button
            key={f.type}
            onClick={() => onSelect(f.href)}
            className={[
              "flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl text-left transition",
              highlighted
                ? "border-2 border-gold shadow-[0_0_0_3px_rgba(232,194,106,0.18)]"
                : "border border-lilac-soft hover:border-lilac-deep/40",
            ].join(" ")}
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
                {highlighted && (
                  <span className="text-[10px] font-bold text-eye-purple bg-gold-soft/70 px-1.5 py-0.5 rounded-full">
                    광고에서 본 그거 ✨
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

