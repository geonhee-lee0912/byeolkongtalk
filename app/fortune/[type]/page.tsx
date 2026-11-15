// 사주 상품 설명 + 구매 — 한 장. 서버 렌더(색인 대상)이고 구매만 클라 섬이다.
import { redirect } from "next/navigation";
import FortuneLandingHero from "@/components/fortune/landing/FortuneLandingHero";
import FortuneLandingSections from "@/components/fortune/landing/FortuneLandingSections";
import PurchaseReachedBeacon from "@/components/fortune/landing/PurchaseReachedBeacon";
import FortuneSamplePreview from "@/components/fortune/landing/FortuneSamplePreview";
import FortunePurchasePanel from "@/components/fortune/FortunePurchasePanel";
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
        trackType={type}
      />

      {/* 사주 고르기를 그림 바로 아래로 — 운영 30일 상품 페이지를 본 86명 중 76명이 맨 위 버튼('이 사주로 보기' = 여기로 건너뛰기)을
          눌렀다. 그래서 위 버튼 없이 처음부터 여기에 둔다(디자인 다듬기 묶음 4 B, 운영자 11-15). 설명은 아래로 — 검색으로 온 사람용으로 그대로 남긴다 */}
      <div id="buy" className="w-full max-w-md mx-auto px-5 mt-6 scroll-mt-4">
        <PurchaseReachedBeacon type={type} />
        <h2 className="text-15 font-bold text-eye-purple mb-4">누구 사주로 볼까</h2>
      </div>
      <FortunePurchasePanel type={type} />

      <div className="w-full max-w-md mx-auto px-5 mt-8">
        <div className="h-px bg-lilac-mid/30" />
      </div>
      <FortuneLandingSections
        questions={copy.questions}
        outline={fortuneOutline(key)}
        lengthHint={FORTUNE_LENGTH_HINT[type]}
        sample={copy.sample}
        samplePreview={<FortuneSamplePreview landingKey={key} />}
        related={related}
      />
    </main>
  );
}
