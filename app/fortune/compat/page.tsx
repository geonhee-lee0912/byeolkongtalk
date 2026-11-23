import FortuneLandingHero from "@/components/fortune/landing/FortuneLandingHero";
import FortuneLandingSections from "@/components/fortune/landing/FortuneLandingSections";
import LandingBuyBar from "@/components/fortune/landing/LandingBuyBar";
import { FORTUNE_CONFIG, FORTUNE_LENGTH_HINT } from "@/lib/fortune/types";
import { fortuneOutline } from "@/lib/fortune/outline";
import { FORTUNE_LANDING } from "@/data/fortune/landing";
import { RELATED_SAJU } from "@/components/upsell/cross-cards";
import { fortuneCardSrc } from "@/lib/fortune/hero";
import { productMetadata } from "@/lib/seo/metadata";

const cfg = FORTUNE_CONFIG.compat;
const copy = FORTUNE_LANDING.compat;

export const metadata = productMetadata({
  title: cfg.label,
  description: copy.hook.replace(/\n/g, " "),
  path: cfg.href,
});

export default function CompatPage() {
  const related = (RELATED_SAJU.compat ?? []).filter((t) => FORTUNE_CONFIG[t]?.active);
  return (
    <main className="flex flex-1 flex-col pb-10 w-full animate-fade-in">
      <FortuneLandingHero
        title={cfg.label}
        hook={copy.hook}
        cardSrc={fortuneCardSrc("compat")}
        cost={cfg.cost}
        chips={[FORTUNE_LENGTH_HINT.compat ?? "", copy.minutes].filter(Boolean)}
      />
      <FortuneLandingSections
        questions={copy.questions}
        outline={fortuneOutline("compat")}
        lengthHint={FORTUNE_LENGTH_HINT.compat}
        sample={copy.sample}
        samplePreview={null}
        related={related}
      />
      {/* 고르기는 따로 떨어진 페이지로(사주 상품과 같은 나누기 — 디자인 다듬기 묶음 4, 11-16) */}
      <LandingBuyBar href={`${cfg.href}/buy`} cost={cfg.cost} trackType="compat" label="두 사람 골라서 보기" />
    </main>
  );
}
