import CompatInput from "@/components/fortune/compat/CompatInput";
import FortuneLandingHero from "@/components/fortune/landing/FortuneLandingHero";
import FortuneLandingSections from "@/components/fortune/landing/FortuneLandingSections";
import { FORTUNE_CONFIG, FORTUNE_LENGTH_HINT } from "@/lib/fortune/types";
import { fortuneOutline } from "@/lib/fortune/outline";
import { FORTUNE_LANDING } from "@/data/fortune/landing";
import { RELATED_SAJU } from "@/components/upsell/cross-cards";
import { fortuneHeroSrc } from "@/lib/fortune/hero";
import { productMetadata } from "@/lib/seo/metadata";

const cfg = FORTUNE_CONFIG.compat_social;
const copy = FORTUNE_LANDING.compat_social;

export const metadata = productMetadata({
  title: cfg.label,
  description: copy.hook.replace(/\n/g, " "),
  path: cfg.href,
});

export default function CompatSocialPage() {
  const related = (RELATED_SAJU.compat_social ?? []).filter((t) => FORTUNE_CONFIG[t]?.active);
  return (
    <main className="flex flex-1 flex-col pb-10 w-full animate-fade-in">
      <FortuneLandingHero
        title={cfg.label}
        hook={copy.hook}
        heroSrc={fortuneHeroSrc("compat_social") ?? "/byeolkong-main.png"}
        chips={[`별 ${cfg.cost}개`, FORTUNE_LENGTH_HINT.compat_social ?? "", copy.minutes].filter(Boolean)}
        ctaLabel="두 사람 사주로 보기"
      />
      <FortuneLandingSections
        questions={copy.questions}
        outline={fortuneOutline("compat_social")}
        lengthHint={FORTUNE_LENGTH_HINT.compat_social}
        sample={copy.sample}
        samplePreview={null}
        related={related}
      />
      <div id="buy" className="w-full max-w-md mx-auto px-5 mt-8 scroll-mt-4">
        <div className="h-px bg-lilac-mid/30" />
        <h2 className="text-[14.5px] font-bold text-eye-purple mt-5">두 사람을 골라줘</h2>
      </div>
      <CompatInput type="compat_social" />
    </main>
  );
}
