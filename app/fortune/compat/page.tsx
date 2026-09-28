import CompatInput from "@/components/fortune/compat/CompatInput";
import FortuneLandingHero from "@/components/fortune/landing/FortuneLandingHero";
import FortuneLandingSections from "@/components/fortune/landing/FortuneLandingSections";
import PurchaseReachedBeacon from "@/components/fortune/landing/PurchaseReachedBeacon";
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
        chips={[`별 ${cfg.cost}개`, FORTUNE_LENGTH_HINT.compat ?? "", copy.minutes].filter(Boolean)}
        ctaLabel="두 사람 사주로 보기"
        trackType="compat"
      />
      <FortuneLandingSections
        questions={copy.questions}
        outline={fortuneOutline("compat")}
        lengthHint={FORTUNE_LENGTH_HINT.compat}
        sample={copy.sample}
        samplePreview={null}
        related={related}
      />
      <div id="buy" className="w-full max-w-md mx-auto px-5 mt-8 scroll-mt-4">
        <div className="h-px bg-lilac-mid/30" />
        <PurchaseReachedBeacon type="compat" />
        <h2 className="text-[14.5px] font-bold text-eye-purple mt-5">두 사람을 골라줘</h2>
      </div>
      <CompatInput type="compat" />
    </main>
  );
}
