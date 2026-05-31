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
  type SpreadCategory,
} from "@/lib/tarot/spreads";
import { TAROT_SPREAD_KEY, type TarotSpreadSelection } from "@/lib/tarot/session";
import {
  getSajuProducts,
  isSajuProduct,
  SAJU_PRODUCT_INFO,
  type SajuProduct,
} from "@/lib/saju/products";
import ProgressSteps from "@/components/concern/ProgressSteps";

const SAJU_ACCENT = "#9F8AD0";
const SAJU_COST = 20;

const SAJU_ICONS: Record<SajuProduct, string> = {
  today_letters: "/2words.png",
  nature: "/flow.png",
  choice: "/choice.png",
  good_days: "/days.png",
};

// 사주 4종 키컬러 — 타로(#6B8DD6/#65B28F/#E0976B/#D4708F)와 같은 파스텔 톤,
// 겹치지 않는 색상(바이올렛/틸/골드/오키드)
const SAJU_PRODUCT_ACCENT: Record<SajuProduct, string> = {
  today_letters: "#8579D4", // 바이올렛
  nature: "#6FB8AE", // 틸
  choice: "#E0B964", // 골드
  good_days: "#C783C9", // 오키드
};

type Selection = SajuProduct | SpreadType;

// 사주가 더 적합한 감정 — 장기 흐름·방향·새 시작
const SAJU_EMOTIONS: EmotionTag[] = [
  "내 앞날의 방향이 궁금해",
  "요즘 내 흐름이 궁금해",
  "새로운 시작이 기대돼",
];

function recommendSpread(concern: string): SpreadType {
  const len = concern.trim().length;
  if (len < 30) return "one_card";
  return len % 2 === 0 ? "two_card" : "three_card";
}

type RecCopy = { headline: string; reason: string };

const SAJU_REC_COPY: Partial<Record<EmotionTag, RecCopy>> & {
  default: RecCopy;
} = {
  "내 앞날의 방향이 궁금해": {
    headline: "네 앞날은 사주로 큰 흐름부터 볼까?",
    reason: "방향 고민은 타고난 기둥을 짚어야 또렷해져",
  },
  "요즘 내 흐름이 궁금해": {
    headline: "지금 네 흐름, 사주로 짚어줄까?",
    reason: "오늘 일주 기준으로 운의 결을 봐줄게",
  },
  "새로운 시작이 기대돼": {
    headline: "새 시작이라면 사주로 큰 그림부터",
    reason: "타고난 흐름을 알면 첫발이 가벼워져",
  },
  default: {
    headline: "사주로 너의 큰 흐름을 짚어볼까?",
    reason: "타고난 기둥을 보면 길이 또렷해져",
  },
};

const TAROT_REC_COPY: Record<
  SpreadType,
  Partial<Record<SpreadCategory, RecCopy>> & { default: RecCopy }
> = {
  one_card: {
    default: {
      headline: "고민이 간결하니까 한 장이면 충분해",
      reason: "짧고 가벼운 질문엔 한 줄 답이 제일 빠르거든",
    },
  },
  two_card: {
    love: {
      headline: "지금 상황이랑 조언을 같이 볼까?",
      reason: "연애는 상황부터 짚어야 조언이 맞아져",
    },
    interpersonal: {
      headline: "관계 상황이랑 조언을 같이 볼까?",
      reason: "지금 어떤 관계인지 짚고 풀어갈 실마리까지",
    },
    career: {
      headline: "상황이랑 조언을 함께 봐줄게",
      reason: "진로는 지금 위치부터 확인하는 게 좋아",
    },
    decision: {
      headline: "찬반 양쪽을 나란히 놓고 볼까?",
      reason: "결정할 땐 한 면만 보면 답이 안 보이거든",
    },
    mental: {
      headline: "의식이랑 무의식 두 장으로 비춰볼까?",
      reason: "눈에 안 잡히는 부분까지 봐야 마음이 풀려",
    },
    default: {
      headline: "두 장으로 상황이랑 조언을 같이 볼까?",
      reason: "지금 상황 먼저 짚고 조언까지 받아보자",
    },
  },
  three_card: {
    love: {
      headline: "나·상대·방향 세 장으로 들여다볼까?",
      reason: "두 사람 얘긴 흐름까지 봐야 명확해져",
    },
    interpersonal: {
      headline: "나·상대·흐름 세 장으로 풀어볼까?",
      reason: "서로 어떻게 엮여 있는지 보면 답이 가까워져",
    },
    career: {
      headline: "과거·현재·미래로 흐름을 볼까?",
      reason: "진로는 그동안 흐름이 답을 알려주거든",
    },
    decision: {
      headline: "선택지랑 지금 상태를 같이 볼까?",
      reason: "둘 다 보면서 내가 어디 있는지도 알아야 해",
    },
    mental: {
      headline: "마음·몸·영혼 세 층으로 볼까?",
      reason: "감정은 여러 결이 겹쳐 있거든",
    },
    worry: {
      headline: "상황·장애물·조언 순서로 풀어줄까?",
      reason: "막힌 걸 찾아야 조언이 구체적이 돼",
    },
    default: {
      headline: "흐름까지 짚어보게 세 장으로 갈까?",
      reason: "상황이 얽혀 보여서 시간 순서로 보자",
    },
  },
  relationship_5: {
    default: {
      headline: "두 사람 마음까지 다 비춰줄까?",
      reason: "관계는 나랑 상대 둘 다 봐야 풀려",
    },
  },
};

type Rec =
  | {
      kind: "saju";
      selection: Selection;
      headline: string;
      reason: string;
      label: string;
      accent: string;
    }
  | {
      kind: "tarot";
      selection: Selection;
      spread: SpreadType;
      headline: string;
      reason: string;
      label: string;
      accent: string;
    };

function getRecommendation(
  emotion: EmotionTag,
  concern: string,
  category: SpreadCategory
): Rec {
  if (SAJU_EMOTIONS.includes(emotion)) {
    const c = SAJU_REC_COPY[emotion] ?? SAJU_REC_COPY.default;
    return {
      kind: "saju",
      selection: "today_letters",
      headline: c.headline,
      reason: c.reason,
      label: SAJU_PRODUCT_INFO.today_letters.label,
      accent: SAJU_ACCENT,
    };
  }
  const spread = recommendSpread(concern);
  const c = TAROT_REC_COPY[spread][category] ?? TAROT_REC_COPY[spread].default;
  return {
    kind: "tarot",
    selection: spread,
    spread,
    headline: c.headline,
    reason: c.reason,
    label: SPREAD_INFO[spread].label,
    accent: SPREAD_INFO[spread].accent,
  };
}

export default function SelectPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingConsultation | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);

  const category = useMemo(
    () =>
      pending ? EMOTION_TO_CATEGORY[pending.emotion as EmotionTag] : "default",
    [pending]
  );
  const spreadOptions = useMemo(() => getSpreadOptions(category), [category]);
  const sajuProducts = useMemo(
    () => (pending ? getSajuProducts(pending.emotion) : []),
    [pending]
  );
  const rec = useMemo(
    () =>
      pending
        ? getRecommendation(pending.emotion, pending.concern, category)
        : null,
    [pending, category]
  );

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
      const cat = EMOTION_TO_CATEGORY[parsed.emotion as EmotionTag];
      setSelected(
        getRecommendation(parsed.emotion, parsed.concern, cat).selection
      );
    } catch {
      router.replace("/concern");
    }
  }, [router]);

  if (!pending || !rec) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const option = EMOTION_OPTIONS.find((o) => o.tag === pending.emotion);

  const handleStart = () => {
    if (!selected) return;
    if (isSajuProduct(selected)) {
      const payload: PendingConsultation = {
        emotion: pending.emotion,
        concern: pending.concern,
        type: "saju",
        sajuProduct: selected,
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

  const startLabel = isSajuProduct(selected)
    ? `${SAJU_PRODUCT_INFO[selected].label} 보러 가기`
    : selected
    ? `${SPREAD_INFO[selected].label}로 카드 뽑으러 가기`
    : "방식을 골라줘";

  return (
    <main className="flex flex-1 flex-col items-center pt-14 pb-8 w-full animate-fade-in">
      {/* 진행 단계 */}
      <div className="mb-8">
        <ProgressSteps current={2} />
      </div>

      {/* 뒤로가기 + 고민(분류 + 내용) 다크 박스 */}
      <div className="w-full max-w-md mx-auto px-5 mb-9 flex flex-col gap-2">
        <Link
          href="/concern"
          className="self-start flex items-center gap-1.5 text-text-light/80 hover:text-eye-purple text-[13px] font-semibold px-2 py-1.5 rounded-lg transition-colors"
        >
          <span className="text-[16px] leading-none -mt-0.5">‹</span>
          <span>고민 수정하려면 뒤로가기</span>
        </Link>

        <div
          className="px-3.5 py-3 rounded-2xl"
          style={{
            background: "#2A1F45",
            boxShadow: "0 2px 10px rgba(30,22,53,0.15)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            {option && (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{ background: EMOTION_GRADIENTS[pending.emotion] }}
                aria-hidden
              >
                <Image
                  src={option.icon}
                  alt=""
                  width={14}
                  height={14}
                  className="object-contain"
                />
              </span>
            )}
            <p className="text-[11px] text-white/60 font-semibold">
              {pending.emotion}
            </p>
          </div>
          <p className="text-[13px] text-white leading-relaxed whitespace-pre-wrap">
            {pending.concern}
          </p>
        </div>
      </div>

      {/* 별콩이 추천 — 사주/타로 중 한 가지 + 추천 이유 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="flex flex-col items-center px-2">
          <div className="relative w-14 h-14 mb-1.5">
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-xl scale-110" />
            <Image
              src="/profile.png"
              alt="별콩이"
              fill
              sizes="56px"
              className="relative rounded-full object-cover"
            />
          </div>
          <p className="font-display text-[17px] text-eye-purple leading-tight text-center">
            {rec.headline}
          </p>
          <p className="text-[12px] text-text-light/85 mt-1.5 leading-relaxed text-center max-w-[280px]">
            &ldquo;{rec.reason}&rdquo;
          </p>
          <div
            className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/85 border"
            style={{ borderColor: `${rec.accent}38` }}
          >
            <span className="text-[11px]">✨</span>
            <span
              className="text-[11px] font-bold"
              style={{ color: rec.accent }}
            >
              {rec.label}
            </span>
            <span className="text-[11px] text-text-light/70">
              추천 · 다른 것도 괜찮아
            </span>
          </div>
        </div>
      </div>

      {/* 타로 섹션 */}
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-lilac-soft/70" />
          <span className="text-[13px] font-bold text-text-light tracking-[0.15em]">
            타로
          </span>
          <div className="flex-1 h-px bg-lilac-soft/70" />
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
        {spreadOptions.map((type) => {
          const info = SPREAD_INFO[type];
          const isSelected = selected === type;
          const isRecommended = rec.kind === "tarot" && rec.spread === type;
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
              {/* 카드 미니어처 — 번호+색상 카드, 겹쳐서 부채꼴 펼침 */}
              <div className="flex flex-shrink-0 items-center justify-center -space-x-3.5 w-[58px]">
                {Array.from({ length: info.cardCount }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[26px] aspect-[2/3] rounded-[4px] border flex items-center justify-center shadow-sm transition-all"
                    style={{
                      background: isSelected
                        ? `color-mix(in srgb, ${info.accent} 26%, white)`
                        : `color-mix(in srgb, ${info.accent} 12%, white)`,
                      borderColor: isSelected
                        ? info.accent
                        : `color-mix(in srgb, ${info.accent} 42%, white)`,
                      transform: `rotate(${
                        (i - (info.cardCount - 1) / 2) * 6
                      }deg)`,
                      zIndex: i,
                    }}
                  >
                    {i === info.cardCount - 1 && (
                      <span
                        className="text-[10px] font-black leading-none tabular-nums"
                        style={{ color: info.accent }}
                      >
                        {i + 1}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[12px] font-black px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: info.accent }}
                  >
                    {info.label}
                  </span>
                  <span className="text-[11px] font-bold text-text-light">
                    ⭐ {info.starCost}별
                  </span>
                  {isRecommended && (
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

      {/* 사주 섹션 */}
      <div className="w-full max-w-md mx-auto px-5 mt-8 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-lilac-soft/70" />
          <span className="text-[13px] font-bold text-text-light tracking-[0.15em]">
            사주
          </span>
          <div className="flex-1 h-px bg-lilac-soft/70" />
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
        {sajuProducts.map((p) => {
          const info = SAJU_PRODUCT_INFO[p];
          const accent = SAJU_PRODUCT_ACCENT[p];
          const isSelected = selected === p;
          const isRecommended = rec.kind === "saju" && rec.selection === p;
          return (
            <button
              key={p}
              onClick={() => setSelected(p)}
              aria-pressed={isSelected}
              className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/90 text-left transition-all"
              style={{
                border: isSelected
                  ? `2px solid ${accent}`
                  : "1px solid #E8DEF5",
                boxShadow: isSelected ? `0 0 0 3px ${accent}1f` : "none",
              }}
            >
              <div className="flex flex-shrink-0 items-center justify-center w-[44px]">
                <Image
                  src={SAJU_ICONS[p]}
                  alt=""
                  width={40}
                  height={40}
                  className="object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[12px] font-black px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {info.label}
                  </span>
                  <span className="text-[11px] font-bold text-text-light">
                    ⭐ {SAJU_COST}별
                  </span>
                  {isRecommended && (
                    <span
                      className="text-[10px] font-black ml-auto px-1.5 py-0.5 rounded-full text-white"
                      style={{ background: "#E5484D" }}
                    >
                      추천 ✨
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-text-light leading-snug mb-1.5">
                  {info.description}
                </p>
                <p
                  className="text-[11px] font-bold leading-snug truncate"
                  style={{ color: accent }}
                >
                  {info.flow}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 시작 버튼 */}
      <div className="w-full max-w-md mx-auto px-5 mt-6 flex flex-col gap-2.5">
        <button
          onClick={handleStart}
          disabled={!selected}
          className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {startLabel}
        </button>
        <Link
          href="/concern"
          className="w-full py-4 bg-transparent hover:bg-lilac-deep/5 text-lilac-deep rounded-2xl font-bold text-[15px] text-center border-2 border-lilac-deep/40 hover:border-lilac-deep/60 transition-colors"
        >
          뒤로
        </Link>
      </div>
    </main>
  );
}
