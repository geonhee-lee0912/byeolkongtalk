"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  PENDING_KEY,
  type EmotionTag,
  type PendingConsultation,
} from "@/lib/emotions";
import ProgressSteps from "@/components/concern/ProgressSteps";

const MIN_LEN = 10;
const MAX_LEN = 200;

export default function ConcernPage() {
  const router = useRouter();
  const [emotion, setEmotion] = useState<EmotionTag | null>(null);
  const [concern, setConcern] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? sessionStorage.getItem("byeolkong:emotion")
        : null;
    if (!stored) {
      router.replace("/");
      return;
    }
    setEmotion(stored as EmotionTag);
  }, [router]);

  if (!emotion) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const option = EMOTION_OPTIONS.find((o) => o.tag === emotion);
  const remain = MAX_LEN - concern.length;

  const canProceed = concern.length >= MIN_LEN && concern.length <= MAX_LEN;

  const handleNext = () => {
    if (concern.length < MIN_LEN) {
      setError(`고민을 ${MIN_LEN}자 이상 적어줘`);
      return;
    }
    if (concern.length > MAX_LEN) {
      setError(`${MAX_LEN}자까지만 적을 수 있어`);
      return;
    }

    const payload: PendingConsultation = { emotion, concern };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    router.push("/select");
  };

  return (
    <main className="flex flex-1 flex-col items-center pt-14 pb-8 w-full animate-fade-in">
      {/* 진행 단계 */}
      <div className="mb-8">
        <ProgressSteps current={1} />
      </div>

      {/* 감정 컨텍스트 칩 — 선택한 고민 분류 싱크 */}
      {option && (
        <div className="w-full max-w-md mx-auto px-5 mb-5">
          <div className="w-full flex flex-col items-center gap-1.5 px-5 py-3 bg-white/85 backdrop-blur-sm rounded-2xl border border-lilac-soft/70 shadow-[0_1px_4px_rgba(90,62,140,0.05)]">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{ background: EMOTION_GRADIENTS[emotion] }}
                aria-hidden
              >
                <Image
                  src={option.icon}
                  alt=""
                  width={18}
                  height={18}
                  className="object-contain"
                />
              </span>
              <span className="font-bold text-eye-purple text-[13px]">
                {option.tag}
              </span>
            </div>
            <p className="text-[11px] text-text-light/80 text-center leading-relaxed">
              {option.description}
            </p>
          </div>
        </div>
      )}

      {/* 고민 입력 — 별콩이 채팅창 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div
          className="relative rounded-3xl border border-lilac-deep/30 overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, #16122E 0%, #241C49 45%, #382C6B 100%)",
            boxShadow:
              "0 4px 20px rgba(30,22,53,0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* 헤더 — 별콩이 프로필 바 */}
          <div
            className="relative z-10 flex items-center gap-2.5 px-4 py-3 border-b border-white/15"
            style={{ background: "#4A3877" }}
          >
            <span className="relative w-9 h-9 flex-shrink-0">
              <Image
                src="/profile.png"
                alt="별콩이"
                fill
                sizes="36px"
                className="rounded-full object-cover"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#4A3877]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-white leading-tight">
                별콩이
              </p>
              <p className="text-[11px] text-white/60 leading-snug mt-0.5">
                고민이 있는 날에도, 괜히 마음이 궁금한 날에도 별콩이는 여기 있어
              </p>
            </div>
          </div>

          {/* 별 파티클 */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute top-[26%] left-[12%] w-1 h-1 bg-gold/60 rounded-full animate-star-twinkle" />
            <div
              className="absolute top-[34%] right-[16%] w-1.5 h-1.5 bg-gold-soft/50 rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.5s" }}
            />
            <div
              className="absolute top-[50%] left-[20%] w-1 h-1 bg-white/40 rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.3s" }}
            />
            <div
              className="absolute top-[44%] right-[10%] w-1 h-1 bg-gold/40 rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.9s" }}
            />
            <div
              className="absolute top-[64%] right-[26%] w-1 h-1 bg-lilac/50 rounded-full animate-star-twinkle"
              style={{ animationDelay: "0.2s" }}
            />
            <div
              className="absolute top-[70%] left-[16%] w-1 h-1 bg-gold-soft/40 rounded-full animate-star-twinkle"
              style={{ animationDelay: "1.2s" }}
            />
            <div className="absolute top-1/3 -right-10 w-48 h-48 bg-lilac/10 rounded-full blur-3xl" />
            <div className="absolute top-2/3 -left-10 w-40 h-40 bg-gold/[0.05] rounded-full blur-3xl" />
          </div>

          <div className="relative px-3.5 pt-5 pb-5 flex flex-col gap-3.5">
            {/* 별콩이 인사 말풍선 */}
            <div className="flex self-end max-w-[88%]">
              <div
                className="relative rounded-2xl rounded-br-md px-4 py-3"
                style={{
                  background: "#FBE89E",
                  boxShadow: "0 2px 10px rgba(232,194,106,0.35)",
                }}
              >
                <p className="text-[14px] font-bold text-eye-purple leading-tight">
                  어떤 고민이야?
                </p>
                <p className="text-[12px] text-eye-purple/85 mt-1 leading-relaxed">
                  편하게 말해줘. 별콩이가 들어볼게 ❤️
                </p>
              </div>
            </div>

            {/* 사용자 입력 */}
            <div className="flex self-end w-full">
              <div
                className="relative flex-1 bg-white rounded-2xl rounded-bl-md overflow-hidden focus-within:ring-2 focus-within:ring-lilac-deep/50 transition-all"
                style={{ boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}
              >
                <textarea
                  value={concern}
                  onChange={(e) => {
                    setConcern(e.target.value.slice(0, MAX_LEN));
                    if (error) setError(null);
                  }}
                  placeholder="요즘 마음에 남는 일을 솔직하게 적어줘.&#10;상황, 사람, 내 마음... 뭐든 좋아"
                  className="w-full h-36 px-4 pt-3.5 pb-1.5 bg-transparent text-[14px] text-eye-purple leading-relaxed resize-none focus:outline-none placeholder:text-text-light/40"
                />
                <div className="flex justify-between items-center px-4 pb-2.5 text-[11px]">
                  <span className="text-text-light/70">
                    구체적일수록 더 깊은 대화가 가능해
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      remain < 0
                        ? "text-red-500"
                        : concern.length >= MAX_LEN * 0.85
                        ? "text-gold"
                        : "text-text-light/60"
                    }`}
                  >
                    {concern.length} / {MAX_LEN}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-red-500 text-center px-5 max-w-md mb-3">
          {error}
        </p>
      )}

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {concern.length < MIN_LEN
            ? `${MIN_LEN}자 이상 적어줘`
            : "운세 선택하러 가기"}
        </button>
        <Link
          href="/"
          className="w-full py-3 rounded-xl border border-lilac-soft/70 text-center text-text-light/70 font-medium text-[14px] hover:text-text-light hover:border-lilac-soft transition"
        >
          뒤로
        </Link>
      </div>
    </main>
  );
}
