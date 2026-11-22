// 사주 상품 설명 + 구매 — 한 장. 서버 렌더(색인 대상)이고 구매만 클라 섬이다.
import { redirect } from "next/navigation";
import FortuneLandingHero from "@/components/fortune/landing/FortuneLandingHero";
import FortuneLandingSections from "@/components/fortune/landing/FortuneLandingSections";
import FortuneSamplePreview from "@/components/fortune/landing/FortuneSamplePreview";
import LandingBuyBar from "@/components/fortune/landing/LandingBuyBar";
import { FORTUNE_CONFIG, FORTUNE_LENGTH_HINT, type FortuneType } from "@/lib/fortune/types";
import { fortuneOutline, type LandingKey } from "@/lib/fortune/outline";
import { FORTUNE_LANDING } from "@/data/fortune/landing";
import { RELATED_SAJU } from "@/components/upsell/cross-cards";
import { fortuneCardSrc } from "@/lib/fortune/hero";

export default async function FortuneProductPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type: raw } = await params;
  const cfg = raw in FORTUNE_CONFIG ? FORTUNE_CONFIG[raw as FortuneType] : null;

  // daily 는 전용 페이지, 타로·비활성은 동적 입력 대상이 아니다(기존 가드와 동일 조건).
  if (!cfg || !cfg.active || cfg.base !== "saju" || cfg.type === "daily") redirect("/fortune");

  const type = cfg.type;
  const key = type as LandingKey;
  const copy = FORTUNE_LANDING[key];
  const related = (RELATED_SAJU[type] ?? []).filter((t) => FORTUNE_CONFIG[t]?.active);

  return (
    <main className="flex flex-1 flex-col pb-10 w-full animate-fade-in">
      <FortuneLandingHero
        title={cfg.label}
        hook={copy.hook}
        cardSrc={fortuneCardSrc(key)}
        cost={cfg.cost}
        chips={[FORTUNE_LENGTH_HINT[type] ?? "", copy.minutes].filter(Boolean)}
      />

      <FortuneLandingSections
        questions={copy.questions}
        outline={fortuneOutline(key)}
        lengthHint={FORTUNE_LENGTH_HINT[type]}
        sample={copy.sample}
        samplePreview={<FortuneSamplePreview landingKey={key} />}
        related={related}
      />

      {/* 설명과 사주 고르기를 나눴다 — 고르기는 /fortune/[type]/buy(디자인 다듬기 묶음 4, 운영자 11-15).
          운영에서 상품 페이지를 본 사람 대부분이 옛 위 버튼으로 고르기 칸에 바로 건너갔다 */}
      <LandingBuyBar href={`${cfg.href}/buy`} cost={cfg.cost} trackType={type} />
    </main>
  );
}
