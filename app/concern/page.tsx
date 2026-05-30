"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  PENDING_KEY,
  type ConsultationType,
  type EmotionTag,
  type PendingConsultation,
} from "@/lib/emotions";

const MIN_LEN = 10;
const MAX_LEN = 200;

export default function ConcernPage() {
  const router = useRouter();
  const [emotion, setEmotion] = useState<EmotionTag | null>(null);
  const [concern, setConcern] = useState("");
  const [type, setType] = useState<ConsultationType | null>(null);
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

  const canProceed =
    concern.length >= MIN_LEN && concern.length <= MAX_LEN && type !== null;

  const handleNext = () => {
    if (concern.length < MIN_LEN) {
      setError(`고민을 ${MIN_LEN}자 이상 적어줘`);
      return;
    }
    if (concern.length > MAX_LEN) {
      setError(`${MAX_LEN}자까지만 적을 수 있어`);
      return;
    }
    if (!type) {
      setError("어떤 방식으로 상담할지 골라줘");
      return;
    }

    const payload: PendingConsultation = { emotion, concern, type };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));

    if (type === "saju") {
      router.push("/saju");
    } else {
      router.push("/tarot");
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/" className="text-[12px] text-text-light/70">
          ‹ 다른 고민 고르기
        </Link>
      </div>

      {/* 감정 컨텍스트 칩 — 선택한 고민 분류 싱크 */}
      {option && (
        <div className="w-full max-w-md mx-auto px-5 mb-5 flex justify-center">
          <div className="flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 bg-white/85 backdrop-blur-sm rounded-full border border-lilac-soft/70 text-[12px] shadow-[0_1px_4px_rgba(90,62,140,0.05)]">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[13px] flex-shrink-0"
              style={{ background: EMOTION_GRADIENTS[emotion] }}
              aria-hidden
            >
              {option.emoji}
            </span>
            <span className="font-bold text-eye-purple">{option.tag}</span>
            <span className="text-text-light/40">·</span>
            <span className="text-text-light">{option.description}</span>
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
                src="/byeolkong-main.png"
                alt="별콩이"
                fill
                sizes="36px"
                className="object-contain"
              />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-display text-[15px] text-white leading-tight">
                별콩이
              </p>
              <p className="text-[11px] text-white/60 leading-snug mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                지금 대화 중
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
                <p className="font-display text-[16px] text-eye-purple leading-tight">
                  어떤 고민이야?
                </p>
                <p className="text-[12px] text-eye-purple/85 mt-1 leading-relaxed">
                  편하게 말해줘. 별콩이가 들어볼게 💜
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
                    구체적일수록 더 잘 봐줄게
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

      {/* 사주 / 타로 picker */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <h2 className="font-display text-[18px] text-eye-purple font-bold mb-3">
          어떻게 봐줄까?
        </h2>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => setType("saju")}
            className={[
              "flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/90 transition-all text-center",
              type === "saju"
                ? "border-2 border-lilac-deep shadow-[0_0_0_3px_rgba(159,138,208,0.18)]"
                : "border border-lilac-soft hover:border-lilac-deep/40",
            ].join(" ")}
            aria-pressed={type === "saju"}
          >
            <span className="text-3xl" aria-hidden>
              🪷
            </span>
            <p className="font-bold text-eye-purple text-[15px]">별콩이 사주</p>
            <p className="text-[11px] text-text-light leading-snug">
              생일·시간으로 흐름을 풀어줘
            </p>
            <p className="text-[11px] font-bold text-lilac-deep mt-1">⭐ 22별</p>
          </button>

          <button
            onClick={() => setType("tarot")}
            className={[
              "flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/90 transition-all text-center",
              type === "tarot"
                ? "border-2 border-gold shadow-[0_0_0_3px_rgba(232,194,106,0.22)]"
                : "border border-lilac-soft hover:border-gold/50",
            ].join(" ")}
            aria-pressed={type === "tarot"}
          >
            <span className="text-3xl" aria-hidden>
              🃏
            </span>
            <p className="font-bold text-eye-purple text-[15px]">별콩이 타로</p>
            <p className="text-[11px] text-text-light leading-snug">
              카드를 뽑아 지금을 봐줘
            </p>
            <p className="text-[11px] font-bold text-gold mt-1">곧 만나</p>
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-red-500 text-center px-5 max-w-md mb-3">
          {error}
        </p>
      )}

      <div className="w-full max-w-md mx-auto px-5">
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {concern.length < MIN_LEN
            ? `${MIN_LEN}자 이상 적어줘`
            : !type
            ? "상담 방식을 골라줘"
            : "별콩이한테 고민 보여주기"}
        </button>
      </div>
    </main>
  );
}
