"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  EMOTION_OPTIONS,
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

      {/* 감정 컨텍스트 */}
      {option && (
        <div className="w-full max-w-md mx-auto px-5 mb-6">
          <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-lilac-soft">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, #E8DEF5 0%, #D4C7EE 100%)",
              }}
            >
              <span className="text-2xl">{option.emoji}</span>
            </div>
            <div>
              <p className="font-bold text-eye-purple text-[15px]">
                {option.tag}
              </p>
              <p className="text-[12px] text-text-light mt-0.5">
                {option.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 고민 입력 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="font-display text-[18px] text-eye-purple font-bold">
            어떤 일이 있었어?
          </h2>
          <span
            className={`text-[11px] ${
              remain < 0 ? "text-red-500" : "text-text-light/70"
            }`}
          >
            {concern.length} / {MAX_LEN}
          </span>
        </div>

        <textarea
          value={concern}
          onChange={(e) => {
            setConcern(e.target.value);
            if (error) setError(null);
          }}
          placeholder="짧게라도 괜찮아. 별콩이가 들어볼게."
          rows={5}
          className="w-full px-4 py-3 rounded-2xl border border-lilac-soft bg-white/90 text-eye-purple placeholder:text-text-light/40 text-[14px] leading-relaxed resize-none focus:outline-none focus:border-lilac-deep/60 transition-colors"
        />

        <p className="text-[11px] text-text-light/60 mt-1.5">
          최소 {MIN_LEN}자 이상 적어줘.
        </p>
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
          다음
        </button>
      </div>
    </main>
  );
}
