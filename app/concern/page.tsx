"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Dialog from "@/components/common/Dialog";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";
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
import { CONTINUATION_KEY, isConcernRewrite } from "@/lib/tarot/session";
import ProgressSteps from "@/components/concern/ProgressSteps";
import SafetyBanner from "@/components/safety/SafetyBanner";
import { concernSafetyMatch } from "@/lib/sensitive-patterns";
import { trackUiEvent } from "@/lib/analytics/ui-events";

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
  // 위기 배너 노출 계측 — 같은 분류·강도는 한 번만
  const bannerSeen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const m = concernSafetyMatch(concern);
    if (!m) return;
    const key = `${m.category}:${m.severity}`;
    if (bannerSeen.current.has(key)) return;
    bannerSeen.current.add(key);
    trackUiEvent("concern_safety_banner_shown", { meta: { severity: m.severity, category: m.category } });
  }, [concern]);

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
        <p className="text-text-light text-14">잠시만…</p>
      </main>
    );
  }

  const option = EMOTION_OPTIONS.find((o) => o.tag === emotion);
  const remain = MAX_LEN - concern.length;

  const canProceed = concern.length >= MIN_LEN && concern.length <= MAX_LEN;

  // 위기 신호(정규식 확신 high) — 고민을 쓰는 그 자리에서 상담 전화를. 진행은 막지 않는다.
  // 모두에게(회원·옛 흐름 포함 — 사용자 결정 2026-10-11): high 정규식을 권장안으로 고쳐 연애 어휘 오탐('약속…먹고'·'재회에 목매' 등)을 걷어낸 뒤 넓혔다(lib/sensitive-patterns)
  const safety = concernSafetyMatch(concern);

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
    // 새로 적은 고민 = 새 주제 — 앞서 버려진 이어가기 표시(예: "이어서 깊게"를 누르고 결제 없이 떠남)가
    // 이 고민의 리딩에 붙어 옛 리딩 요약이 주입되지 않게 지운다.
    // 단 이어가기 도중 "고민 다시 적기"(CONCERN_REWRITE_HREF)로 온 건 같은 이어가기의 고민을 다듬는 것이라 남긴다(지금 prod 그대로).
    if (!isConcernRewrite(window.location.search)) sessionStorage.removeItem(CONTINUATION_KEY);
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
              className="btn btn-secondary btn-lg flex-col backdrop-blur-sm"
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
                <span className="font-bold text-eye-purple text-13">
                  {option.tag}
                </span>
                <span className="text-text-light text-11">변경</span>
              </div>
              <p className="text-11 text-text-light text-center leading-relaxed">
                {option.description}
              </p>
            </button>
          </div>
        )}

        {/* 고민 입력 — 별콩이 채팅창 */}
        <div className="w-full max-w-md mx-auto px-5 mb-6">
          <div
            className="relative rounded-2xl border border-lilac-deep/30 overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, #16122E 0%, #241C49 45%, #382C6B 100%)", // design-allow: 고민 화면 밤하늘 채팅창(스펙 §2.8 장면)
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
                <p className="text-14 font-bold text-white leading-tight">
                  별콩이
                </p>
                <p className="text-11 text-white/60 leading-snug mt-0.5">
                  고민이 있는 날에도, 괜히 마음이 궁금한 날에도 별콩이는 여기 있어
                </p>
              </div>
            </div>

            {/* 별 파티클 */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <div className="absolute top-[26%] left-[12%] w-1 h-1 bg-gold/60 rounded-full" />
              <div
                className="absolute top-[34%] right-[16%] w-1.5 h-1.5 bg-gold-soft/50 rounded-full"
                style={{ animationDelay: "0.5s" }}
              />
              <div
                className="absolute top-[50%] left-[20%] w-1 h-1 bg-white/40 rounded-full"
                style={{ animationDelay: "0.3s" }}
              />
              <div
                className="absolute top-[44%] right-[10%] w-1 h-1 bg-gold/40 rounded-full"
                style={{ animationDelay: "0.9s" }}
              />
              <div
                className="absolute top-[64%] right-[26%] w-1 h-1 bg-lilac/50 rounded-full"
                style={{ animationDelay: "0.2s" }}
              />
              <div
                className="absolute top-[70%] left-[16%] w-1 h-1 bg-gold-soft/40 rounded-full"
                style={{ animationDelay: "1.2s" }}
              />
            </div>

            <div className="relative px-3.5 pt-5 pb-5 flex flex-col gap-3.5">
              {/* 별콩이 인사 말풍선 */}
              <div className="flex self-end max-w-[88%]">
                <div
                  className="relative rounded-2xl rounded-br-sm px-4 py-3"
                  style={{
                    background: "#FBE89E",
                    boxShadow: "0 2px 10px rgba(232,194,106,0.35)",
                  }}
                >
                  <p className="text-14 font-bold text-eye-purple leading-tight">
                    어떤 고민이야?
                  </p>
                  <p className="text-12 text-eye-purple/85 mt-1 leading-relaxed">
                    편하게 말해줘. 별콩이가 들어볼게 ❤️
                  </p>
                </div>
              </div>

              {/* 사용자 입력 */}
              <div className="flex self-end w-full">
                <div
                  className="relative flex-1 bg-white rounded-2xl rounded-bl-sm overflow-hidden focus-within:ring-2 focus-within:ring-lilac-deep/50 transition-all"
                  style={{ boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}
                >
                  <textarea
                    value={concern}
                    onChange={(e) => {
                      setConcern(e.target.value.slice(0, MAX_LEN));
                      if (error) setError(null);
                    }}
                    placeholder="요즘 마음에 남는 일을 솔직하게 적어줘.&#10;상황, 사람, 내 마음... 뭐든 좋아"
                    className="w-full h-36 px-4 pt-3.5 pb-1.5 bg-transparent text-14 text-eye-purple leading-relaxed resize-none focus:outline-none placeholder:text-text-faint"
                  />
                  <div className="flex justify-between items-center px-4 pb-2.5 text-11">
                    <span className="text-text-light">
                      구체적일수록 더 깊은 대화가 가능해
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        remain < 0
                          ? "text-red-500"
                          : concern.length >= MAX_LEN * 0.85
                          ? "text-gold"
                          : "text-text-light"
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

        {safety && (
          <div className="w-full max-w-md mx-auto px-5 -mt-3 mb-3">
            <SafetyBanner category={safety.category} severity={safety.severity} />
          </div>
        )}

        {error && (
          <p className="text-12 text-red-500 text-center px-5 max-w-md mb-3">
            {error}
          </p>
        )}

        <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="btn btn-primary btn-lg disabled:cursor-not-allowed"
          >
            {concern.length < MIN_LEN
              ? `${MIN_LEN}자 이상 적어줘`
              : "타로 카드 뽑으러 가기"}
          </button>
          <Link
            href="/"
            className="btn btn-text btn-lg"
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

  // 이름은 바텀시트지만 모양은 가운데 창 — 공통 Dialog(배경 스크롤 잠금·ESC)
  return (
    <Dialog
      label="고민 태그 변경"
      onClose={onClose}
      z={90}
      widthClassName="max-w-md"
      gutterClassName="px-5"
      backdropClassName="bg-night/50 backdrop-blur-sm"
    >
      <div className="w-full max-w-md bg-cream rounded-3xl border border-lilac-mid/30 shadow-modal max-h-[72vh] overflow-y-auto scrollbar-hover">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="font-display text-17 font-bold text-eye-purple">
            어떤 고민이야?
          </h2>
          <OverlayCloseButton
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light hover:bg-lilac-soft/50"
          >
            ✕
          </OverlayCloseButton>
        </div>

        <div className="px-5 pb-6">
          <p className="text-12 font-bold text-text-light mb-2">
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

          <p className="text-12 font-bold text-text-light mb-2">
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
    </Dialog>
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
      className={`w-full card flex items-center gap-3 text-left transition-all ${
        active ? "outline-2 outline-accent -outline-offset-2" : ""
      }`}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ background: EMOTION_GRADIENTS[option.tag] }}
        aria-hidden
      >
        <Image src={option.icon} alt="" width={28} height={28} className="object-contain" />
      </span>
      <span className="flex-1 min-w-0 font-bold text-eye-purple text-14 leading-snug">
        {option.tag}
      </span>
    </button>
  );
}
