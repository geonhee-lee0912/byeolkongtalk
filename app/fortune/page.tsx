"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  FORTUNE_GRADIENTS,
  FORTUNE_HASHTAGS,
  FORTUNE_LENGTH_HINT,
  DEFAULT_FORTUNE_CHIP,
  fortuneProductsByCategory,
  type FortuneCategory,
} from "@/lib/fortune/types";
import FortuneGeneratingList from "@/components/fortune/FortuneGeneratingList";
import { FortuneIcon } from "@/components/fortune/FortuneIcon";
import FortuneHeader from "@/components/fortune/FortuneHeader";
import CategoryChips from "@/components/fortune/CategoryChips";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function FortunePage() {
  const [chip, setChip] = useState<FortuneCategory>(DEFAULT_FORTUNE_CHIP);
  const [monthNum, setMonthNum] = useState<number | null>(null);

  // 이번 달 숫자는 클라에서만 계산 (SSR-클라 타임존 월 경계 mismatch 방지)
  useEffect(() => setMonthNum(new Date().getMonth() + 1), []);

  const selectChip = (c: FortuneCategory) => {
    setChip(c);
    trackUiEvent("fortune_chip_clicked", { meta: { category: c } });
  };

  const items = fortuneProductsByCategory(chip);

  return (
    <main className="flex flex-1 flex-col items-center pb-8 w-full animate-fade-in">
      <FortuneHeader />

      <FortuneGeneratingList />

      <p className="w-full max-w-md mx-auto px-5 pt-6 text-[13.5px] font-bold text-eye-purple">
        🌙 어떤 운세가 궁금해?
      </p>
      <CategoryChips active={chip} onSelect={selectChip} />

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-3">
        {items.map((f) => {
          const tagline =
            f.type === "monthly" && monthNum
              ? `${monthNum}월 한 달, 너의 흐름을 미리 짚어줄게`
              : f.tagline;
          const inner = (
            <div
              className={[
                "w-full rounded-2xl p-4 border flex items-center gap-3.5 transition",
                f.active
                  ? "bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] hover:border-lilac-deep/60 active:scale-[0.99]"
                  : "bg-white/40 border-lilac-mid/15 opacity-70",
              ].join(" ")}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: FORTUNE_GRADIENTS[f.type] }}
              >
                <FortuneIcon type={f.type} size={40} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-eye-purple">{f.label}</span>
                  {f.cost === 0 ? (
                    <span className="text-[10px] font-bold text-sub-warm bg-gold-soft/30 px-1.5 py-0.5 rounded-full">
                      하루 1회 무료
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                      ⭐ {f.cost}
                    </span>
                  )}
                  {FORTUNE_LENGTH_HINT[f.type] && (
                    <span className="text-[10px] font-medium text-text-light/70">
                      · {FORTUNE_LENGTH_HINT[f.type]}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                  {tagline}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {FORTUNE_HASHTAGS[f.type].map((h) => (
                    <span
                      key={h}
                      className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
              {!f.active && (
                <span className="text-[10px] text-text-light/50 shrink-0">준비 중</span>
              )}
            </div>
          );

          return f.active ? (
            <Link key={f.type} href={f.href}>
              {inner}
            </Link>
          ) : (
            <div key={f.type}>{inner}</div>
          );
        })}

        {/* 무료 칩 전용 — 별자리는 리포트 상품(FortuneConfig: readings·emotionTag·cost)이 아니라
            별도 인터랙티브 콘텐츠(관계망·LLM 0)라 config에 넣지 않고 별도 카드로 붙인다. */}
        {chip === "free" && (
          <>
          <Link href="/fortune/byeoljari">
            <div className="w-full rounded-2xl p-4 border bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] hover:border-lilac-deep/60 active:scale-[0.99] transition flex items-center gap-3.5">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl"
                style={{ background: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)" }}
              >
                <Image src="/icons/fortune/byeoljari.webp" alt="" width={48} height={48} className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-eye-purple">우리 인연 별자리</span>
                  <span className="text-[10px] font-bold text-sub-warm bg-gold-soft/30 px-1.5 py-0.5 rounded-full">
                    무료
                  </span>
                </div>
                <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                  생일만 넣어서 친구들과의 인연을 별자리로 그려봐! 나랑 궁합이 좋은 친구를 찾는건 덤!
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {["인연", "궁합", "친구와함께"].map((h) => (
                    <span
                      key={h}
                      className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
          <Link href="/fortune/saju-mbti">
            <div className="w-full rounded-2xl p-4 border bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] hover:border-lilac-deep/60 active:scale-[0.99] transition flex items-center gap-3.5">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl"
                style={{ background: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)" }}
              >
                <Image src="/icons/fortune/saju_mbti.webp" alt="" width={48} height={48} className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-eye-purple">사주 MBTI</span>
                  <span className="text-[10px] font-bold text-sub-warm bg-gold-soft/30 px-1.5 py-0.5 rounded-full">
                    무료
                  </span>
                </div>
                <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                  네가 아는 너 vs 타고난 너! 12문항이랑 생년월일로 사주 기반의 전래 MBTI 유형이 나와.
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {["성격유형", "사주", "조선전래"].map((h) => (
                    <span
                      key={h}
                      className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
          </>
        )}
      </div>

      <p className="mt-6 text-[11px] text-text-light/50 text-center px-8 leading-relaxed">
        운세는 정해진 미래가 아니라 흐름과 가능성을 비춰주는 거야.
        <br />
        결과는 <span className="text-text-light/70">내 고민톡</span>에서 다시 볼 수 있어.
      </p>
    </main>
  );
}
