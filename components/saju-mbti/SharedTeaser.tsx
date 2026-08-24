"use client";

import { useEffect } from "react";
import Image from "next/image";
import type { ResultTokens } from "@/lib/saju-mbti/share-tokens";
import { TYPE_CONTENT, MATCH_NARRATIVE } from "@/lib/saju-mbti/content";
import { characterImage } from "@/lib/saju-mbti/character-image";

// 공유 링크로 들어온 친구용 축약 티저. 상대 명식·오각·자아는 없음(무영속·PII).
export function SharedTeaser({ tokens, onStart }: { tokens: ResultTokens; onStart: () => void }) {
  const content = TYPE_CONTENT[tokens.paljaCode];
  useEffect(() => {
    if (!content) onStart();
  }, [content, onStart]);
  if (!content) return null;
  const narrative = MATCH_NARRATIVE[tokens.band];
  const charImg = characterImage(tokens.paljaCode);

  return (
    <div className="w-full max-w-md mx-auto px-5 py-10 animate-fade-in" data-stage="shared">
      <p className="text-center text-[12px] tracking-[0.14em] text-lilac-deep mb-4">누군가의 사주 MBTI 결과</p>

      <div className="bg-night rounded-[18px] px-5 py-7 text-center">
        {charImg && (
          <Image src={charImg} alt={content.character} width={144} height={144} className="w-32 h-32 object-contain mx-auto mb-1" priority />
        )}
        <p className="font-display text-[26px] text-cream-warm">{content.character}</p>
        <p className="text-[12.5px] tracking-wide text-lilac-mid mt-1">
          {tokens.paljaCode} · <span className="text-gold-soft">{narrative.title}</span>
        </p>
        <p className="text-[14px] leading-relaxed text-lilac-soft mt-3 max-w-[290px] mx-auto">{content.oneLiner}</p>
      </div>

      <p className="text-center text-[14px] text-eye-purple mt-6 mb-4">너도 네 유형이 궁금하면?</p>
      <button
        type="button"
        onClick={onStart}
        className="w-full py-4 rounded-2xl bg-lilac-deep text-white font-bold text-[16px] active:scale-[0.98] transition"
      >
        나도 해보기
      </button>
    </div>
  );
}
