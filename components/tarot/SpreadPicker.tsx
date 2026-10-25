"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  EMOTION_OPTIONS,
  normalizeEmotionTag,
  type PendingConsultation,
} from "@/lib/emotions";
import {
  SPREAD_INFO,
  EMOTION_TO_CATEGORY,
  getSpreadOptionsForTag,
  getSpreadDescription,
  getPositionLabels,
  type SpreadType,
} from "@/lib/tarot/spreads";
import { CARD_BACK_IMAGE } from "@/lib/tarot/cards";
import { CONCERN_REWRITE_HREF, TAROT_SPREAD_KEY, type TarotSpreadSelection } from "@/lib/tarot/session";
import { tarotPrice } from "@/lib/tarot/pricing";
import { guestShortLine } from "@/lib/tarot/guest-price";
import { spreadAmountLine } from "@/lib/tarot/spread-facts";
import { TAROT_HERO_GRADIENT } from "@/lib/heroGradients";

// 옛 타로톡 스프레드 고르기 — 반반 비교의 옛 그룹(지금 prod 그대로). 2026-10-09 이전 app/tarot/page.tsx 를 그대로 옮겼다.
// 가격만 그룹 가격 함수(tarotPrice(…, "legacy") = SPREAD_INFO.starCost)로 읽는다. 🗓️ 판정 뒤 메뉴판이 이기면 이 파일을 지운다.
// 추천 기능은 0697771에서 제품 결정으로 제거 — 자동선택·추천 뱃지 없이 유저가 직접 고른다.
export default function SpreadPicker({ pending, guest = false }: { pending: PendingConsultation; guest?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SpreadType | null>(null);

  const category = useMemo(() => {
    const tag = normalizeEmotionTag(pending.emotion);
    return tag ? EMOTION_TO_CATEGORY[tag] : "default";
  }, [pending]);
  const options = useMemo(() => getSpreadOptionsForTag(pending.emotion), [pending]);

  const normalizedTag = normalizeEmotionTag(pending.emotion);
  const displayTag = normalizedTag ?? pending.emotion;
  const option = EMOTION_OPTIONS.find((o) => o.tag === displayTag);

  const handleStart = () => {
    if (!selected) return;
    const payload: TarotSpreadSelection = {
      spreadType: selected,
      spreadCategory: category,
      emotion: pending.emotion,
      concern: pending.concern,
    };
    sessionStorage.setItem(TAROT_SPREAD_KEY, JSON.stringify(payload));
    router.push("/tarot/draw");
  };

  // break-keep — 한글 단어 중간에서 줄이 끊기지 않게(320px 에서 "봐줄/게"·"깊/이"·"1,000원부/터", 사용자 2026-10-25).
  // break-words — 띄어쓰기 없는 긴 고민 글은 그래도 칸을 넘치지 않게 끊는다(LoginSheet 와 같은 짝)
  // text-pretty — 마지막 줄에 단어 하나만 남지 않게(지원 안 하는 브라우저는 그냥 break-keep 로 끊긴다)
  return (
    <main className="flex flex-1 flex-col items-center pb-8 w-full animate-fade-in break-keep break-words text-pretty">
      {/* 최상단 — 고민 다시 적기 */}
      <div className="w-full max-w-md mx-auto px-5 pt-3">
        <Link
          href={CONCERN_REWRITE_HREF}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-light/70 hover:text-lilac-deep transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="11.5 3 5 9 11.5 15" />
          </svg>
          <span>고민 다시 적기</span>
        </Link>
      </div>

      {/* 별콩이 + 타이틀 + 설명 (히어로 대체) */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center mt-2 mb-5">
        <Image
          src="/byeolkong-tarot.png"
          alt="별콩이"
          width={120}
          height={120}
          priority
          className="drop-shadow-lg"
        />
        <h1 className="font-display text-[24px] text-eye-purple text-center mt-4 tracking-wide leading-snug text-balance">
          너의 고민을 내가 해결해 줄게
        </h1>
        <p className="text-[12px] text-text-light text-center mt-1">
          카드를 몇 장으로 깊이 볼지는 네가 골라봐 ✨
        </p>
      </div>

      {/* 고민 내용 — 히어로 팔레트 배경 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div
          className="p-4 rounded-2xl border border-lilac-mid/25"
          style={{ background: TAROT_HERO_GRADIENT }}
        >
          <div className="flex items-center gap-2 mb-2">
            {option && <span className="text-lg">{option.emoji}</span>}
            <span className="text-[13px] font-bold text-gold-soft">
              {pending.emotion}
            </span>
          </div>
          <p className="text-[13px] text-white/75 leading-relaxed line-clamp-3">
            {pending.concern}
          </p>
        </div>
      </div>

      {/* 디바이더 — 리딩 방법 고르기 */}
      <div className="w-full max-w-md mx-auto px-5 mb-4 flex items-center gap-3">
        <span className="flex-1 h-px bg-lilac-mid/30" />
        <span className="text-[11px] font-bold text-text-light tracking-[0.15em]">
          리딩 방법 고르기
        </span>
        <span className="flex-1 h-px bg-lilac-mid/30" />
      </div>

      {/* 스프레드 카드 */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2.5">
        {options.map((type) => {
          const info = SPREAD_INFO[type];
          const isSelected = selected === type;
          const positions = getPositionLabels(type, category, pending.emotion);
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
                    style={{ transform: `rotate(${(i - (info.cardCount - 1) / 2) * 6}deg)` }}
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
                {/* 배지·가격은 각각 쪼개지 않는다 — 한 줄에 안 들어가면 가격이 통째로 다음 줄로(320px 7장 "가능성 스프레드 · / 7카드"·"⭐ / 55별") */}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-1">
                  <span
                    className="text-[12.5px] font-black px-1.5 py-0.5 rounded-md text-white whitespace-nowrap"
                    style={{ backgroundColor: info.accent }}
                  >
                    {info.label}
                    {info.cardCount > 3 && ` · ${info.cardCount}카드`}
                  </span>
                  <span className="text-[11px] font-bold text-text-light whitespace-nowrap">
                    ⭐ {tarotPrice(type, "legacy")}별
                  </span>
                </div>
                {/* 로그인 전 방문자(새 흐름) — 가입 선물 15별 기준 한 줄(스펙 2026-10-11 §3-1) */}
                {guest && (
                  <p className="text-[11px] font-bold text-eye-purple mb-1">
                    {guestShortLine(tarotPrice(type, "legacy")).text}
                  </p>
                )}
                {/* 분량 안내 — 첫 답 길이 + 자연 마무리까지 받는 질문 수(spec 2026-10-25-타로-원투카드-마무리-안내줄 §2-1) */}
                <p className="text-[11px] font-medium text-eye-purple/85 mb-1">
                  {spreadAmountLine(type)}
                </p>
                <p className="text-[12px] text-text-light leading-snug mb-1.5">
                  {getSpreadDescription(type, category)}
                </p>
                <p
                  className="text-[11px] font-bold leading-snug"
                  style={{ color: info.accent }}
                >
                  {/* 자리 이름은 이름 단위로만 줄바꿈("망설이는 / 이유" 방지). 가운뎃점 앞은 붙는 공백이라 줄은 "… ·" 로 끝나고 다음 줄은 이름으로 시작한다 */}
                  {positions.map((label, i) => (
                    <Fragment key={i}>
                      {i > 0 && " · "}
                      <span className="whitespace-nowrap">{label}</span>
                    </Fragment>
                  ))}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 크로스링크 */}
      <div className="w-full max-w-md mx-auto px-5 mt-4 flex flex-col gap-2">
        {normalizedTag === "직장·학교에서 사람이 어려워" && (
          <Link
            href="/fortune/compat-social"
            className="flex items-center justify-between p-3.5 rounded-2xl border border-dashed border-lilac-mid/60 bg-cream/50"
          >
            <span className="text-[12.5px] text-eye-purple">
              🤝 두 사람 사주로 보는 <b>인간관계 궁합</b>도 있어
            </span>
            <span className="text-text-light text-[12px]">›</span>
          </Link>
        )}
      </div>

      {/* 시작 버튼 */}
      <div className="w-full max-w-md mx-auto px-5 mt-2">
        <button
          onClick={handleStart}
          disabled={!selected}
          className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {selected ? `${SPREAD_INFO[selected].label}로 카드 뽑으러 가기` : "스프레드를 골라줘"}
        </button>
      </div>
    </main>
  );
}
