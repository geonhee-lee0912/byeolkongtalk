"use client";

import type { SajuResult } from "@/lib/saju/calc";
import type { PaljaType } from "@/lib/saju-mbti/mapping";
import type { SelfType } from "@/lib/saju-mbti/self-type";
import type { MatchRate } from "@/lib/saju-mbti/match";
import type { AxisKey } from "@/lib/saju-mbti/constants";
import { POLES } from "@/lib/saju-mbti/constants";
import { TYPE_CONTENT, ELEMENT_MODULE, MATCH_NARRATIVE } from "@/lib/saju-mbti/content";
import Image from "next/image";
import SajuBoard from "@/components/saju/SajuBoard";
import { ELEMENT_COLORS } from "@/lib/saju/elements";
import { ElementPentagon } from "./ElementPentagon";
import { characterImage } from "@/lib/saju-mbti/character-image";

const AXIS_LABEL: Record<AxisKey, string> = {
  yinYang: "음양",
  strength: "강유",
  wealth: "재인",
  nurture: "생단",
};

const AXES: AxisKey[] = ["yinYang", "strength", "wealth", "nurture"];

const AXIS_MEANING: Record<AxisKey, { summary: string; poles: [{ p: string; t: string }, { p: string; t: string }] }> = {
  yinYang: { summary: "에너지의 방향", poles: [{ p: "양", t: "기운이 밖으로 뻗느냐" }, { p: "음", t: "안으로 고이느냐" }] },
  strength: { summary: "밀고 나가는 힘", poles: [{ p: "강", t: "내가 판을 쥐느냐" }, { p: "유", t: "흐름에 맡기느냐" }] },
  wealth: { summary: "무엇에 손이 먼저 가는지", poles: [{ p: "재", t: "실리를 먼저 보느냐" }, { p: "인", t: "의미를 먼저 보느냐" }] },
  nurture: { summary: "사람을 대하는 결", poles: [{ p: "생", t: "품어서 북돋우느냐" }, { p: "단", t: "끊어서 바로잡느냐" }] },
};

export interface ResultViewProps {
  saju?: SajuResult;
  palja: PaljaType;
  self: SelfType;
  match: MatchRate;
  onRestart?: () => void;
  onShare?: () => void;
  /** 공유 링크 뷰 — 토큰만이라 명식·오각·4축 게이지 숨기고 하단을 "나도 해보기"로. */
  shared?: boolean;
  onStart?: () => void;
}

export function ResultView({ saju, palja, self, match, onRestart, onShare, shared = false, onStart }: ResultViewProps) {
  const content = TYPE_CONTENT[palja.code];
  if (!content) return null;
  const selfContent = TYPE_CONTENT[self.code];
  const narrative = MATCH_NARRATIVE[match.band];
  const charImg = characterImage(palja.code);
  const selfImg = characterImage(self.code);

  return (
    <div className="w-full max-w-md mx-auto px-4 pt-4 pb-10 flex flex-col gap-3 animate-fade-in" data-stage="result">
      {shared && (
        <p className="text-center text-[12px] tracking-[0.14em] text-lilac-deep">누군가의 사주 MBTI 결과</p>
      )}
      {/* ① 팔자 히어로 */}
      <div className="bg-night rounded-[18px] px-5 py-6 text-center">
        <p className="text-[11px] tracking-[0.14em] text-lilac-deep mb-4">타고난 너 · 사주 팔자</p>
        <div className="flex justify-center mb-1">
          {charImg && (
            <Image src={charImg} alt={content.character} width={144} height={144} className="w-32 h-32 object-contain" priority />
          )}
        </div>
        <p className="text-[17px] font-medium text-lilac-soft">{content.character}</p>
        <p className="font-display text-[30px] tracking-[0.08em] text-cream-warm mt-0.5">{palja.code}</p>
        <p className="text-[12.5px] tracking-wide text-lilac-mid mt-1.5">
          <span className="text-gold-soft">{content.hanja}</span> · {palja.element} 기운
        </p>
        <p className="text-[14px] leading-relaxed text-lilac-soft mt-3 max-w-[290px] mx-auto">{content.oneLiner}</p>
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-[12.5px] leading-relaxed text-lilac-soft text-balance">{content.memeSubtitle}</p>
        </div>
      </div>

      {/* 4축 정도 — 사주(팔자) 백분위 단일 척도 (공유 뷰는 생일 없어 숨김) */}
      {!shared && (
      <section className="bg-night rounded-2xl px-4 py-4">
        <p className="text-[11px] tracking-wide text-lilac-deep mb-3">타고난 너의 4축 · 사주 기준</p>
        <div className="flex flex-col gap-2.5">
          {AXES.map((axis) => {
            const a = palja.axes[axis];
            const [front, back] = POLES[axis];
            const frontPct = Math.round(a.pct);
            const frontWins = a.pole === front;
            const domPct = frontWins ? frontPct : 100 - frontPct;
            return (
              <div key={axis} className="flex items-center gap-2 text-[11.5px]">
                <span className={`w-6 text-right ${frontWins ? "text-gold-soft font-medium" : "text-lilac-deep"}`}>{front}</span>
                <div className="flex-1 h-2 rounded-full bg-night-deep overflow-hidden">
                  <div className="h-full bg-lilac" style={{ width: `${frontPct}%` }} />
                </div>
                <span className={`w-6 ${!frontWins ? "text-gold-soft font-medium" : "text-lilac-deep"}`}>{back}</span>
                <span className="w-9 text-right text-lilac-mid tabular-nums">{domPct}%</span>
              </div>
            );
          })}
        </div>
        <details className="mt-3 border-t border-white/10 pt-2.5">
          <summary className="text-[11.5px] text-lilac-mid cursor-pointer list-none">4축이 뭘 뜻할까? ▾</summary>
          <div className="flex flex-col gap-2.5 mt-2.5">
            {AXES.map((axis) => {
              const m = AXIS_MEANING[axis];
              return (
                <div key={axis} className="text-[11.5px] leading-relaxed">
                  <p className="text-gold-soft font-medium">{AXIS_LABEL[axis]} · {m.summary}</p>
                  <p className="text-lilac-soft mt-0.5">
                    <span className="font-bold text-cream-warm">{m.poles[0].p}</span> {m.poles[0].t}
                    <span className="text-lilac-deep"> vs </span>
                    <span className="font-bold text-cream-warm">{m.poles[1].p}</span> {m.poles[1].t}
                  </p>
                </div>
              );
            })}
          </div>
        </details>
      </section>
      )}

      {/* ③ 본문 */}
      <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-4 py-3.5">
        <p className="text-[11px] font-medium tracking-wide text-lilac-deep mb-1.5">성격</p>
        <p className="text-[13.5px] leading-relaxed text-eye-purple">{content.personality}</p>
      </section>

      <div className="grid grid-cols-1 gap-2.5">
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
            const img = characterImage(c.code);
            return (
              <div key={c.code} className="bg-gold-soft/25 rounded-xl px-3 py-2.5">
                <p className="text-[10.5px] font-medium text-[#B08A2A]">잘 맞아</p>
                <div className="flex items-center gap-2 mt-1">
                  {img && <Image src={img} alt="" width={32} height={32} className="w-8 h-8 object-contain shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-eye-purple tracking-wide leading-none">{c.code}</p>
                    <p className="text-[10.5px] text-text-light truncate mt-0.5">{t?.character ?? c.code}</p>
                  </div>
                </div>
                <p className="text-[11.5px] leading-snug text-text-light mt-1.5">{c.reason}</p>
              </div>
            );
          })}
          {content.compat.clashes.map((c) => {
            const t = TYPE_CONTENT[c.code];
            const img = characterImage(c.code);
            return (
              <div key={c.code} className="bg-lilac-soft rounded-xl px-3 py-2.5">
                <p className="text-[10.5px] font-medium text-lilac-deep">부딪혀</p>
                <div className="flex items-center gap-2 mt-1">
                  {img && <Image src={img} alt="" width={32} height={32} className="w-8 h-8 object-contain shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-eye-purple tracking-wide leading-none">{c.code}</p>
                    <p className="text-[10.5px] text-text-light truncate mt-0.5">{t?.character ?? c.code}</p>
                  </div>
                </div>
                <p className="text-[11.5px] leading-snug text-text-light mt-1.5">{c.reason}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 오행 질감 */}
      <section
        className="bg-white border rounded-2xl px-4 py-3.5"
        style={{ borderColor: ELEMENT_COLORS[palja.element].bar }}
      >
        <p className="text-[11px] font-medium tracking-wide mb-1.5" style={{ color: ELEMENT_COLORS[palja.element].text }}>
          내가 {palja.element} 기운이라 이렇게 변주돼
        </p>
        <p className="text-[13px] leading-relaxed text-eye-purple">{ELEMENT_MODULE[palja.element].texture}</p>
      </section>
      {/* 디바이더 — 유형 콘텐츠 ↔ 증거(사주 원판)+리빌 */}
      <div className="text-center my-2 text-[12px] tracking-[0.1em] text-lilac-mid">· · ·</div>

      {/* ④ 사주 원판 (공유 뷰는 생일 없어 숨김) */}
      {!shared && saju && (
        <section className="bg-cream-warm border border-lilac/60 rounded-2xl px-2 py-4">
          <p className="text-[11px] font-medium tracking-wide text-lilac-deep mb-3 text-center">타고난 너의 사주 원판</p>
          <SajuBoard saju={saju} />
          <div className="flex justify-center mt-2">
            <ElementPentagon dist={palja.elementDist} />
          </div>
        </section>
      )}

      {/* ⑤ 리빌 */}
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

      {/* ⑥ 하단 CTA */}
      {shared ? (
        <button
          type="button"
          onClick={onStart}
          className="w-full py-4 rounded-2xl bg-lilac-deep text-white font-bold text-[16px] active:scale-[0.98] transition mt-3"
        >
          나도 해보기
        </button>
      ) : (
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
      )}
    </div>
  );
}
