"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  EMOTION_OPTIONS,
  EMOTION_GRADIENTS,
  LOVE_TAGS,
  OTHER_TAGS,
  PENDING_KEY,
  normalizeEmotionTag,
  type EmotionOption,
  type EmotionTag,
  type PendingConsultation,
} from "@/lib/emotions";
import ProgressSteps from "@/components/concern/ProgressSteps";

const MIN_LEN = 10;
const MAX_LEN = 200;
// 정규화 실패(완전히 낯선 문자열)일 때 흐름을 이어갈 안전 기본값
const DEFAULT_TAG: EmotionTag = "그냥 별콩이한테 털어놓고 싶어";

export default function ConcernPage() {
  const router = useRouter();
  const [emotion, setEmotion] = useState<EmotionTag | null>(null);
  const [concern, setConcern] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? sessionStorage.getItem("byeolkong:emotion")
        : null;
    if (!stored) {
      router.replace("/");
      return;
    }
    // 구 태그(v2)·낯선 문자열도 정규화해서 흐름을 계속 이어간다
    setEmotion(normalizeEmotionTag(stored) ?? DEFAULT_TAG);

    // /tarot에서 뒤로 돌아온 경우: 기 입력한 고민 복원
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PendingConsultation;
        if (parsed.concern) setConcern(parsed.concern.slice(0, MAX_LEN));
      } catch {
        /* ignore */
      }
    }
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

  const handleSelectTag = (tag: EmotionTag) => {
    setEmotion(tag);
    sessionStorage.setItem("byeolkong:emotion", tag);
    setTagSheetOpen(false);
  };

  const handleNext = () => {
    if (concern.length < MIN_LEN) {
      setError(`고민을 ${MIN_LEN}자 이상 적어줘`);
      return;
    }
    if (concern.length > MAX_LEN) {
      setError(`${MAX_LEN}자까지만 적을 수 있어`);
      return;
    }

    const payload: PendingConsultation = { emotion, concern, type: "tarot" };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    router.push("/tarot");
  };

  return (
    <>
      <main className="flex flex-1 flex-col items-center pt-14 pb-8 w-full animate-fade-in">
        {/* 진행 단계 */}
        <div className="mb-8">
          <ProgressSteps current={1} />
        </div>

        {/* 감정 컨텍스트 칩 — 탭하면 태그 변경 */}
        {option && (
          <div className="w-full max-w-md mx-auto px-5 mb-5">
            <button
              type="button"
              onClick={() => setTagSheetOpen(true)}
              className="w-full flex flex-col items-center gap-1.5 px-5 py-3 bg-white/85 backdrop-blur-sm rounded-2xl border border-lilac-soft/70 shadow-[0_1px_4px_rgba(90,62,140,0.05)] hover:border-lilac-deep/40 transition-colors"
            >
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
                <span className="text-text-light/50 text-[11px]">변경</span>
              </div>
              <p className="text-[11px] text-text-light/80 text-center leading-relaxed">
                {option.description}
              </p>
            </button>
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
              : "타로 카드 뽑으러 가기"}
          </button>
          <Link
            href="/"
            className="w-full py-4 bg-transparent hover:bg-lilac-deep/5 text-lilac-deep rounded-2xl font-bold text-[15px] text-center border-2 border-lilac-deep/40 hover:border-lilac-deep/60 transition-colors"
          >
            뒤로
          </Link>
        </div>
      </main>

      {tagSheetOpen && (
        <EmotionTagSheet
          current={emotion}
          onSelect={handleSelectTag}
          onClose={() => setTagSheetOpen(false)}
        />
      )}
    </>
  );
}

/** 감정 컨텍스트 칩 탭 → 태그 변경 바텀시트 (연애 6 + 비연애 4) */
function EmotionTagSheet({
  current,
  onSelect,
  onClose,
}: {
  current: EmotionTag;
  onSelect: (tag: EmotionTag) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const loveOptions = EMOTION_OPTIONS.filter((o) => LOVE_TAGS.includes(o.tag));
  const otherOptions = EMOTION_OPTIONS.filter((o) => OTHER_TAGS.includes(o.tag));

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="고민 태그 변경"
    >
      <div
        className="w-full max-w-md bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 그랩바 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="font-display text-[16px] font-bold text-eye-purple">
            어떤 고민이야?
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-6">
          <p className="text-[11.5px] font-bold text-text-light/70 mb-2">
            연애 고민
          </p>
          <div className="flex flex-col gap-2 mb-4">
            {loveOptions.map((option) => (
              <TagSheetItem
                key={option.tag}
                option={option}
                active={option.tag === current}
                onClick={() => onSelect(option.tag)}
              />
            ))}
          </div>

          <p className="text-[11.5px] font-bold text-text-light/70 mb-2">
            다른 고민
          </p>
          <div className="flex flex-col gap-2">
            {otherOptions.map((option) => (
              <TagSheetItem
                key={option.tag}
                option={option}
                active={option.tag === current}
                onClick={() => onSelect(option.tag)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TagSheetItem({
  option,
  active,
  onClick,
}: {
  option: EmotionOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl bg-white/90 text-left transition-all border ${
        active ? "border-2 border-lilac-deep bg-lilac-soft/30" : "border-lilac-soft/70"
      }`}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ background: EMOTION_GRADIENTS[option.tag] }}
        aria-hidden
      >
        <Image src={option.icon} alt="" width={28} height={28} className="object-contain" />
      </span>
      <span className="flex-1 min-w-0 font-bold text-eye-purple text-[13.5px] leading-snug">
        {option.tag}
      </span>
    </button>
  );
}
