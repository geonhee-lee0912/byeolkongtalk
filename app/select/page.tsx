"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  SPREAD_INFO,
  EMOTION_TO_CATEGORY,
  getSpreadOptions,
  getSpreadDescription,
  getPositionLabels,
  type SpreadType,
} from "@/lib/tarot/spreads";
import { CARD_BACK_IMAGE } from "@/lib/tarot/cards";
import { TAROT_SPREAD_KEY, type TarotSpreadSelection } from "@/lib/tarot/session";
import ProgressSteps from "@/components/concern/ProgressSteps";

const SAJU_ACCENT = "#9F8AD0";
const SAJU_COST = 22;

type Selection = "saju" | SpreadType;

function recommendSpread(concern: string): SpreadType {
  const len = concern.trim().length;
  if (len < 30) return "one_card";
  return len % 2 === 0 ? "two_card" : "three_card";
}

export default function SelectPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingConsultation | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);

  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(PENDING_KEY)
        : null;
    if (!raw) {
      router.replace("/concern");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PendingConsultation;
      if (!parsed.concern || !parsed.emotion) {
        router.replace("/concern");
        return;
      }
      setPending(parsed);
      setSelected(recommendSpread(parsed.concern));
    } catch {
      router.replace("/concern");
    }
  }, [router]);

  const category = useMemo(
    () =>
      pending ? EMOTION_TO_CATEGORY[pending.emotion as EmotionTag] : "default",
    [pending]
  );
  const spreadOptions = useMemo(() => getSpreadOptions(category), [category]);
  const recommended = useMemo(
    () => (pending ? recommendSpread(pending.concern) : "one_card"),
    [pending]
  );

  if (!pending) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const option = EMOTION_OPTIONS.find((o) => o.tag === pending.emotion);

  const handleStart = () => {
    if (!selected) return;
    if (selected === "saju") {
      const payload: PendingConsultation = {
        emotion: pending.emotion,
        concern: pending.concern,
        type: "saju",
      };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
      router.push("/saju");
      return;
    }
    const payload: TarotSpreadSelection = {
      spreadType: selected,
      spreadCategory: category,
      emotion: pending.emotion,
      concern: pending.concern,
    };
    sessionStorage.setItem(TAROT_SPREAD_KEY, JSON.stringify(payload));
    router.push("/tarot/draw");
  };

  const startLabel =
    selected === "saju"
      ? "별콩이 사주 보러 가기"
      : selected
      ? `${SPREAD_INFO[selected].label}로 카드 뽑으러 가기`
      : "방식을 골라줘";

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-4 flex items-center justify-between">
        <Link href="/concern" className="text-[12px] text-text-light/70">
          ‹ 고민 다시 적기
        </Link>
      </div>

      {/* 진행 단계 */}
      <div className="mb-5">
        <ProgressSteps current={2} />
      </div>

      {/* 감정 컨텍스트 칩 */}
      {option && (
        <div className="w-full max-w-md mx-auto px-5 mb-3 flex justify-center">
          <div className="flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 bg-white/85 backdrop-blur-sm rounded-full border border-lilac-soft/70 text-[12px] shadow-[0_1px_4px_rgba(90,62,140,0.05)]">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ background: EMOTION_GRADIENTS[pending.emotion] }}
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
            <span className="font-bold text-eye-purple">{pending.emotion}</span>
          </div>
        </div>
      )}

      {/* 고민 요약 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        <div className="p-3.5 bg-white/70 backdrop-blur-sm rounded-2xl border border-lilac-soft/70">
          <p className="text-[13px] text-text-light leading-relaxed line-clamp-3">
            {pending.concern}
          </p>
        </div>
      </div>

      {/* 별콩이 안내 */}
      <div className="w-full max-w-md mx-auto px-5 mb-3">
        <div className="flex items-center gap-2.5">
          <Image
            src="/profile.png"
            alt="별콩이"
            width={36}
            height={36}
            className="rounded-full bg-cream-warm"
          />
          <p className="text-[13px] text-eye-purple leading-snug">
            어떻게 봐줄까? 마음에 드는 방식을 골라봐 ✨
          </p>
        </div>
      </div>

      {/* 운세 방식 리스트 — 별콩이 사주 + 타로 스프레드 */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
        {/* 별콩이 사주 */}
        <button
          onClick={() => setSelected("saju")}
          aria-pressed={selected === "saju"}
          className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/90 text-left transition-all"
          style={{
            border:
              selected === "saju"
                ? `2px solid ${SAJU_ACCENT}`
                : "1px solid #E8DEF5",
            boxShadow:
              selected === "saju" ? `0 0 0 3px ${SAJU_ACCENT}1f` : "none",
          }}
        >
          <div className="flex flex-shrink-0 items-center justify-center w-[58px]">
            <span className="text-3xl" aria-hidden>
              🪷
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="text-[12.5px] font-black px-1.5 py-0.5 rounded-md text-white"
                style={{ backgroundColor: SAJU_ACCENT }}
              >
                별콩이 사주
              </span>
              <span className="text-[11px] font-bold text-text-light">
                ⭐ {SAJU_COST}별
              </span>
            </div>
            <p className="text-[12px] text-text-light leading-snug mb-1.5">
              생일·시간으로 너의 네 기둥을 짚어 흐름을 풀어줄게
            </p>
            <p
              className="text-[11px] font-bold leading-snug truncate"
              style={{ color: SAJU_ACCENT }}
            >
              사주 4기둥 · 오행 흐름 · 별콩이 풀이
            </p>
          </div>
        </button>

        {/* 타로 스프레드 */}
        {spreadOptions.map((type) => {
          const info = SPREAD_INFO[type];
          const isSelected = selected === type;
          const positions = getPositionLabels(type, category);
          return (
            <button
              key={type}
              onClick={() => setSelected(type)}
              aria-pressed={isSelected}
              className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/90 text-left transition-all"
              style={{
                border: isSelected
                  ? `2px solid ${info.accent}`
                  : "1px solid #E8DEF5",
                boxShadow: isSelected ? `0 0 0 3px ${info.accent}1f` : "none",
              }}
            >
              {/* 카드 미니어처 */}
              <div className="flex flex-shrink-0 items-center -space-x-3.5 w-[58px] justify-center">
                {Array.from({ length: info.cardCount }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[26px] aspect-[2/3] rounded-[4px] overflow-hidden border border-white shadow-sm"
                    style={{
                      transform: `rotate(${
                        (i - (info.cardCount - 1) / 2) * 6
                      }deg)`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={CARD_BACK_IMAGE}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[12.5px] font-black px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: info.accent }}
                  >
                    {info.label}
                  </span>
                  <span className="text-[11px] font-bold text-text-light">
                    ⭐ {info.starCost}별
                  </span>
                  {recommended === type && (
                    <span className="text-[10px] font-bold text-lilac-deep ml-auto">
                      추천 ✨
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-text-light leading-snug mb-1.5">
                  {getSpreadDescription(type, category)}
                </p>
                <p
                  className="text-[11px] font-bold leading-snug truncate"
                  style={{ color: info.accent }}
                >
                  {positions.join(" · ")}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 시작 버튼 */}
      <div className="w-full max-w-md mx-auto px-5 mt-6">
        <button
          onClick={handleStart}
          disabled={!selected}
          className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {startLabel}
        </button>
      </div>
    </main>
  );
}
