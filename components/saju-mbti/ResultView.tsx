"use client";

import type { SajuResult } from "@/lib/saju/calc";
import type { PaljaType } from "@/lib/saju-mbti/mapping";
import type { SelfType } from "@/lib/saju-mbti/self-type";
import type { MatchRate } from "@/lib/saju-mbti/match";
import type { AxisKey } from "@/lib/saju-mbti/constants";
import { TYPE_CONTENT, ELEMENT_MODULE, MATCH_NARRATIVE } from "@/lib/saju-mbti/content";
import Image from "next/image";
import SajuBoard from "@/components/saju/SajuBoard";
import { ElementPentagon } from "./ElementPentagon";
import { characterImage } from "@/lib/saju-mbti/character-image";

const AXIS_LABEL: Record<AxisKey, string> = {
  yinYang: "음양",
  strength: "강유",
  wealth: "재인",
  nurture: "생단",
};

export interface ResultViewProps {
  saju: SajuResult;
  palja: PaljaType;
  self: SelfType;
  match: MatchRate;
  onRestart: () => void;
  onShare: () => void;
}

export function ResultView({ saju, palja, self, match, onRestart, onShare }: ResultViewProps) {
  const content = TYPE_CONTENT[palja.code];
  if (!content) return null;
  const selfContent = TYPE_CONTENT[self.code];
  const narrative = MATCH_NARRATIVE[match.band];
  const charImg = characterImage(palja.code);
  const selfImg = characterImage(self.code);

  return (
    <div className="w-full max-w-md mx-auto px-4 pt-4 pb-10 flex flex-col gap-3 animate-fade-in" data-stage="result">
      {/* ① 팔자 히어로 */}
      <div className="bg-night rounded-[18px] px-5 py-6 text-center">
        <p className="text-[11px] tracking-[0.14em] text-lilac-deep mb-4">타고난 너 · 사주 팔자</p>
        <div className="flex justify-center mb-1">
          {charImg && (
            <Image src={charImg} alt={content.character} width={144} height={144} className="w-32 h-32 object-contain" priority />
          )}
        </div>
        <p className="font-display text-[26px] text-cream-warm">{content.character}</p>
        <p className="text-[12.5px] tracking-wide text-lilac-mid mt-1">
          {palja.code} · <span className="text-gold-soft">{content.hanja}</span> · {palja.element} 기운
        </p>
        <p className="text-[14px] leading-relaxed text-lilac-soft mt-3 max-w-[290px] mx-auto">{content.oneLiner}</p>
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-[12px] text-lilac-mid">↓ 네가 아는 너랑 얼마나 같을까? 맨 아래에서 ↓</p>
        </div>
      </div>

      {/* ② 밈 부제 */}
      <div className="bg-lilac-soft rounded-xl px-4 py-2.5">
        <p className="text-[12.5px] leading-relaxed text-eye-purple">{content.memeSubtitle}</p>
      </div>

      {/* ③ 본문 */}
      <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-4 py-3.5">
        <p className="text-[11px] font-medium tracking-wide text-lilac-deep mb-1.5">성격</p>
        <p className="text-[13.5px] leading-relaxed text-eye-purple">{content.personality}</p>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-4 py-3.5">
          <p className="text-[11px] font-medium tracking-wide text-[#C99A3A] mb-1.5">빛</p>
          <p className="text-[13px] leading-relaxed text-eye-purple">{content.light}</p>
        </section>
        <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-4 py-3.5">
          <p className="text-[11px] font-medium tracking-wide text-lilac-deep mb-1.5">그림자</p>
          <p className="text-[13px] leading-relaxed text-eye-purple">{content.shadow}</p>
        </section>
      </div>

      <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-4 py-3.5">
        <p className="text-[11px] font-medium tracking-wide text-[#C86A8A] mb-1.5">연애</p>
        <p className="text-[13.5px] leading-relaxed text-eye-purple">{content.love}</p>
      </section>

      <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-4 py-3.5">
        <p className="text-[11px] font-medium tracking-wide text-lilac-deep mb-2">궁합</p>
        <div className="grid grid-cols-2 gap-2.5">
          {content.compat.fits.map((c) => {
            const t = TYPE_CONTENT[c.code];
            return (
              <div key={c.code} className="bg-gold-soft/25 rounded-xl px-3 py-2.5">
                <p className="text-[10.5px] font-medium text-[#B08A2A]">잘 맞아</p>
                <p className="text-[13px] font-medium text-eye-purple mt-0.5">
                  {t?.character ?? c.code} <span className="text-[10.5px] text-text-light">{c.code}</span>
                </p>
                <p className="text-[11.5px] leading-snug text-text-light mt-1">{c.reason}</p>
              </div>
            );
          })}
          {content.compat.clashes.map((c) => {
            const t = TYPE_CONTENT[c.code];
            return (
              <div key={c.code} className="bg-lilac-soft rounded-xl px-3 py-2.5">
                <p className="text-[10.5px] font-medium text-lilac-deep">부딪혀</p>
                <p className="text-[13px] font-medium text-eye-purple mt-0.5">
                  {t?.character ?? c.code} <span className="text-[10.5px] text-text-light">{c.code}</span>
                </p>
                <p className="text-[11.5px] leading-snug text-text-light mt-1">{c.reason}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 오행 질감 */}
      <section className="bg-gold-soft/20 border border-gold/40 rounded-2xl px-4 py-3.5">
        <p className="text-[11px] font-medium tracking-wide text-[#C0392B] mb-1.5">
          {palja.element} 기운이 얹힘 <span className="text-text-light font-normal">· 사주 전용</span>
        </p>
        <p className="text-[13px] leading-relaxed text-eye-purple">{ELEMENT_MODULE[palja.element].texture}</p>
      </section>

      {/* ④ 사주 원판 */}
      <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-2 py-4">
        <p className="text-[11px] font-medium tracking-wide text-lilac-deep mb-3 text-center">타고난 너의 사주 원판</p>
        <SajuBoard saju={saju} />
        <div className="flex justify-center mt-2">
          <ElementPentagon dist={palja.elementDist} />
        </div>
      </section>

      {/* ⑤ 리빌 */}
      <div className="text-center my-2 text-[12px] tracking-[0.1em] text-lilac-mid">· · ·</div>
      <div className="bg-night rounded-[18px] px-4 py-5">
        <p className="text-[13px] text-lilac-soft mb-3">그런데, 네가 문항에서 답한 너는—</p>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 bg-night-deep rounded-xl px-3 py-2 text-center">
            <p className="text-[10.5px] text-lilac-deep">자아 · 문항</p>
            {selfImg && <Image src={selfImg} alt="" width={48} height={48} className="w-12 h-12 object-contain mx-auto mt-0.5" />}
            <p className="font-display text-[15px] text-gold-soft mt-0.5">{selfContent?.character ?? self.code}</p>
            <p className="text-[11px] text-lilac-mid">{self.code}</p>
          </div>
          <span className="text-lilac-deep">→</span>
          <div className="flex-1 bg-night-deep rounded-xl px-3 py-2 text-center">
            <p className="text-[10.5px] text-lilac-deep">팔자 · 사주</p>
            {charImg && <Image src={charImg} alt="" width={48} height={48} className="w-12 h-12 object-contain mx-auto mt-0.5" />}
            <p className="font-display text-[15px] text-gold-soft mt-0.5">{content.character}</p>
            <p className="text-[11px] text-lilac-mid">{palja.code}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mb-4">
          {match.perAxis.map((a) => (
            <div
              key={a.axis}
              className={`flex items-center gap-2 text-[12px] rounded-lg px-2.5 py-1.5 ${a.agree ? "" : "bg-[#2c1f22]"}`}
            >
              <span className={`w-8 ${a.agree ? "text-lilac-mid" : "text-[#E0A0A0]"}`}>{AXIS_LABEL[a.axis]}</span>
              <span className="flex-1 text-lilac-soft">
                {a.selfPole} <span className="text-lilac-deep">↔</span> {a.paljaPole}
              </span>
              <span className={a.agree ? "text-[#7f9a7f]" : "text-[#E07A7A] font-medium"}>{a.agree ? "일치" : "갈림"}</span>
            </div>
          ))}
        </div>

        <div className="text-center py-3 border-t border-b border-white/10">
          <span className="font-display text-[30px] text-gold">{match.matchCount}/4</span>
          <p className="text-[15px] font-medium text-cream-warm mt-0.5">{narrative.title}</p>
        </div>
        <p className="text-[13px] leading-relaxed text-lilac-soft mt-3.5">{narrative.body}</p>
      </div>

      {/* ⑥ 공유/다시하기 */}
      <div className="flex gap-2.5 mt-3">
        <button
          type="button"
          onClick={onShare}
          className="flex-1 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] active:scale-[0.98] transition"
        >
          나 {content.character}래, 넌?
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="px-4 py-3 rounded-xl bg-cream-warm border border-lilac text-lilac-deep font-medium text-[14px] active:scale-[0.98] transition"
        >
          다시
        </button>
      </div>
    </div>
  );
}
